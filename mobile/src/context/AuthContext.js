import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import api from '../services/api';
import { notificationService } from '../services/notifications';
import { clearLinkPreviewCache } from '../components/LinkPreview';
import { updateWidgetGigData } from '../services/widgetService';

const AuthContext = createContext(null);

const BIOMETRIC_ENABLED_KEY = 'biometricEnabled';
const BIOMETRIC_PROMPT_SHOWN_KEY = 'biometricPromptShown';
const BACKGROUND_LOCK_DELAY_MS = 5 * 60 * 1000; // 5 minutes

const configureRevenueCat = async (userId) => {
  try {
    const apiKey = Platform.OS === 'ios'
      ? Constants.expoConfig?.extra?.revenueCatApiKeyIos
      : Constants.expoConfig?.extra?.revenueCatApiKeyAndroid;
    if (!apiKey) return;
    Purchases.configure({ apiKey, appUserID: userId });
  } catch (err) {
    console.warn('RevenueCat configure failed:', err.message);
  }
};

async function checkBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const initAttempted = useRef(false);
  const backgroundTimestamp = useRef(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Prevent double initialization
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initAuth = async () => {
      setError(null);
      try {
        await api.loadTokens();

        // Load biometric preference
        const bioEnabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
        const isBioEnabled = bioEnabled === 'true';
        setBiometricEnabledState(isBioEnabled);

        if (api.accessToken) {
          // If biometric is enabled, lock the app on cold start
          if (isBioEnabled) {
            const available = await checkBiometricAvailable();
            if (available) {
              setIsLocked(true);
            }
          }

          try {
            const userData = await api.getMe();
            setUser(userData);
            setIsOffline(false);
            await configureRevenueCat(userData.id);
            updateWidgetGigData();
          } catch (fetchError) {
            // Only wipe the session on a definitive AUTH rejection. Network,
            // timeout, or 5xx server errors must keep the tokens so the user
            // isn't kicked back to login just because the API is having a
            // bad moment — they'll retry automatically on next action.
            if (fetchError.type === 'AUTH') {
              await api.clearTokens();
              setIsLocked(false);
              setError(fetchError.message);
            } else {
              setIsOffline(true);
            }
          }
        }
      } catch (tokenError) {
        // Failed to load tokens from storage
        setError('Failed to load saved session');
      } finally {
        setLoading(false);
      }
    };

    api.onSessionExpired = () => {
      setUser(null);
      setError(null);
      setIsLocked(false);
      api.clearTokens();
    };

    initAuth();
  }, []);

  // AppState listener for background → foreground: biometric lock + token refresh
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'background') {
        if (!backgroundTimestamp.current) {
          backgroundTimestamp.current = Date.now();
        }
      } else if (nextAppState === 'active' && appState.current === 'background') {
        // Biometric lock check
        if (backgroundTimestamp.current && biometricEnabled) {
          const elapsed = Date.now() - backgroundTimestamp.current;
          if (elapsed > BACKGROUND_LOCK_DELAY_MS) {
            const available = await checkBiometricAvailable();
            if (available) {
              setIsLocked(true);
            }
          }
        }
        backgroundTimestamp.current = null;

        // Proactively refresh token when returning from background
        // This prevents stale-token 401s on the user's first action back
        if (api.accessToken && api.refreshToken) {
          try {
            if (api.isTokenExpiringSoon()) {
              await api.refreshAccessToken();
            }
          } catch {
            // Non-fatal: the normal request flow will also try to refresh
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [biometricEnabled]);

  // Retry auth when coming back online
  const retryAuth = useCallback(async () => {
    if (!api.accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const userData = await api.getMe();
      setUser(userData);
      setIsOffline(false);
      await configureRevenueCat(userData.id);
    } catch (fetchError) {
      // Same rule as initAuth: only AUTH errors clear tokens.
      if (fetchError.type === 'AUTH') {
        await api.clearTokens();
        setError(fetchError.message);
      } else {
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    const data = await api.signup(email, password, displayName);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    updateWidgetGigData();
    return data;
  }, []);

  const promptBiometricSetup = useCallback(async () => {
    try {
      const alreadyAsked = await AsyncStorage.getItem(BIOMETRIC_PROMPT_SHOWN_KEY);
      if (alreadyAsked === 'true') return;

      const available = await checkBiometricAvailable();
      if (!available) return;

      // Determine label (platform-aware)
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const label = Platform.OS === 'ios'
        ? (hasFaceId ? 'Face ID' : 'Touch ID')
        : (hasFaceId ? 'Face Unlock' : 'Fingerprint');

      await AsyncStorage.setItem(BIOMETRIC_PROMPT_SHOWN_KEY, 'true');

      Alert.alert(
        `Enable ${label}?`,
        `Use ${label} to quickly unlock BandChat when you return.`,
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              // Verify biometric works before enabling
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: `Confirm ${label}`,
                disableDeviceFallback: true,
                cancelLabel: 'Cancel',
              });
              if (result.success) {
                await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
                setBiometricEnabledState(true);
              }
            },
          },
        ]
      );
    } catch {
      // Silently fail — not critical
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    updateWidgetGigData();
    setTimeout(() => promptBiometricSetup(), 1000);
    return data;
  }, [promptBiometricSetup]);

  const googleLogin = useCallback(async (credential) => {
    const data = await api.googleAuth(credential);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    updateWidgetGigData();
    setTimeout(() => promptBiometricSetup(), 1000);
    return data;
  }, [promptBiometricSetup]);

  const appleLogin = useCallback(async (identityToken, fullName) => {
    const data = await api.appleAuth(identityToken, fullName);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    setTimeout(() => promptBiometricSetup(), 1000);
    return data;
  }, [promptBiometricSetup]);

  const logout = useCallback(async () => {
    try {
      await notificationService.unregister();
      await api.logout();
      await Purchases.logOut();
    } catch (err) {
      // silently fail
    } finally {
      setUser(null);
      setIsLocked(false);
      clearLinkPreviewCache();
    }
  }, []);

  const updateUser = useCallback((userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  }, []);

  const unlockApp = useCallback(() => {
    setIsLocked(false);
  }, []);

  const setBiometricEnabled = useCallback(async (enabled) => {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    setBiometricEnabledState(enabled);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isOffline,
    isLocked,
    biometricEnabled,
    signup,
    login,
    googleLogin,
    appleLogin,
    logout,
    updateUser,
    retryAuth,
    clearError,
    unlockApp,
    setBiometricEnabled,
    isAuthenticated: !!user,
  }), [user, loading, error, isOffline, isLocked, biometricEnabled, signup, login, googleLogin, appleLogin, logout, updateUser, retryAuth, clearError, unlockApp, setBiometricEnabled]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
