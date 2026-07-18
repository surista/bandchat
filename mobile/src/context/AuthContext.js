import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import api from '../services/api';
import { getUiString, setUiString } from '../services/storage';
import userPreferences from '../services/userPreferences';
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
        const bioEnabled = await getUiString(BIOMETRIC_ENABLED_KEY);
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

  /**
   * Show the biometric setup prompt.
   *
   * HIG-compliant flow (v1.07.28):
   * - Suppress only if THIS device's local flag is set — biometric
   *   enrollment is a per-device decision, so a "Not Now" recorded on
   *   another device must not silently suppress the prompt here. A new
   *   device install always gets its own chance.
   * - The "shown" flag is written ONLY from the button handlers (after the
   *   user actually answers), not before the Alert. A user who never sees
   *   or never answers the Alert (app killed mid-prompt) gets a re-prompt.
   * - Triggered only from the AppState listener below (foreground-after-idle
   *   detection: user has been backgrounded ≥5 minutes and returns), not
   *   from the login/signup flow — HIG says alerts should be tied to user
   *   intent, not app-launch heuristics.
   */
  const promptBiometricSetup = useCallback(async () => {
    try {
      const localAsked = await getUiString(BIOMETRIC_PROMPT_SHOWN_KEY);
      if (localAsked === 'true') return;

      const available = await checkBiometricAvailable();
      if (!available) return;

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const label = Platform.OS === 'ios'
        ? (hasFaceId ? 'Face ID' : 'Touch ID')
        : (hasFaceId ? 'Face Unlock' : 'Fingerprint');

      const markShown = async () => {
        await setUiString(BIOMETRIC_PROMPT_SHOWN_KEY, 'true');
        userPreferences.set('auth.biometricPromptShown', true);
      };

      Alert.alert(
        `Enable ${label}?`,
        `Use ${label} to quickly unlock BandChat when you return.`,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => { markShown(); },
          },
          {
            text: 'Enable',
            onPress: async () => {
              await markShown();
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: `Confirm ${label}`,
                disableDeviceFallback: true,
                cancelLabel: 'Cancel',
              });
              if (result.success) {
                await setUiString(BIOMETRIC_ENABLED_KEY, 'true');
                setBiometricEnabledState(true);
              }
            },
          },
        ],
        { cancelable: true, onDismiss: () => { markShown(); } }
      );
    } catch {
      // Silently fail — not critical
    }
  }, []);

  // AppState listener for background → foreground: biometric lock + token
  // refresh + biometric-setup prompt. Declared after promptBiometricSetup so
  // it can be referenced in the dependency array below.
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
        // Biometric prompt (suggest setup): HIG says alerts should be tied
        // to user intent, not app-launch heuristics. Trigger ONLY when the
        // user has actually felt the friction — i.e. returns after being
        // backgrounded ≥5 min and biometric is NOT yet enabled.
        if (
          user &&
          !biometricEnabled &&
          backgroundTimestamp.current &&
          Date.now() - backgroundTimestamp.current > BACKGROUND_LOCK_DELAY_MS
        ) {
          promptBiometricSetup();
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
  }, [biometricEnabled, user, promptBiometricSetup]);

  // (Removed in v1.06.81: a register-on-user-id-change useEffect added in
  // v1.06.75 caused severe device-level UI lag — auth, workspace switch, and
  // channel taps all stalled on spinners. Reverted to v1.06.74's mount-only
  // registration in App.js. The "sporadic notifications" race condition that
  // motivated the change still exists; needs a different fix that's verified
  // on a real device before shipping.)

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    updateWidgetGigData();
    return data;
  }, []);

  const googleLogin = useCallback(async (credential) => {
    const data = await api.googleAuth(credential);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    updateWidgetGigData();
    return data;
  }, []);

  const appleLogin = useCallback(async (identityToken, fullName) => {
    const data = await api.appleAuth(identityToken, fullName);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    return data;
  }, []);

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
    await setUiString(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
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
