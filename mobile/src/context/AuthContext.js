import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import api from '../services/api';

const AuthContext = createContext(null);

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const initAttempted = useRef(false);

  useEffect(() => {
    // Prevent double initialization
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initAuth = async () => {
      setError(null);
      try {
        await api.loadTokens();
        if (api.accessToken) {
          try {
            const userData = await api.getMe();
            setUser(userData);
            setIsOffline(false);
            await configureRevenueCat(userData.id);
          } catch (fetchError) {
            // Check if it's a network/timeout error (app started offline)
            if (fetchError.type === 'NETWORK' || fetchError.type === 'TIMEOUT') {
              // Keep tokens but mark as offline - user can retry later
              setIsOffline(true);
              // App started offline, keeping stored tokens
            } else {
              // Auth error (token invalid) - clear tokens
              await api.clearTokens();
              setError(fetchError.message);
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
      if (fetchError.type === 'NETWORK' || fetchError.type === 'TIMEOUT') {
        setIsOffline(true);
      } else {
        await api.clearTokens();
        setError(fetchError.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    const data = await api.signup(email, password, displayName);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    await configureRevenueCat(data.user.id);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
      await Purchases.logOut();
    } catch (err) {
      // silently fail
    } finally {
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isOffline,
    signup,
    login,
    logout,
    updateUser,
    retryAuth,
    clearError,
    isAuthenticated: !!user,
  }), [user, loading, error, isOffline, signup, login, logout, updateUser, retryAuth, clearError]);

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
