/**
 * @fileoverview Authentication context provider for BandChat.
 * Manages user authentication state, login/logout, and session persistence.
 */

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';

/**
 * @typedef {Object} User
 * @property {string} id - User's unique identifier
 * @property {string} email - User's email address
 * @property {string} displayName - User's display name
 * @property {string} [avatarUrl] - URL to user's avatar image
 * @property {string} [bio] - User's bio/description
 * @property {Array<{id: string, name: string, role: string}>} workspaces - User's workspaces
 */

/**
 * @typedef {Object} AuthContextValue
 * @property {User|null} user - Current authenticated user or null
 * @property {boolean} loading - Whether auth state is being initialized
 * @property {boolean} isAuthenticated - Whether user is authenticated
 * @property {function} signup - Create new account
 * @property {function} login - Login with email/password
 * @property {function} googleLogin - Login with Google OAuth
 * @property {function} logout - Log out current user
 * @property {function} updateUser - Update user data in state
 */

const AuthContext = createContext(null);

/**
 * Authentication provider component.
 * Wraps the app to provide auth state and methods via context.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (api.accessToken) {
        try {
          const userData = await api.getMe();
          setUser(userData);
        } catch (error) {
          // Access token expired or invalid — try refreshing via httpOnly cookie
          const refreshed = await api.refreshAccessToken();
          if (refreshed) {
            try {
              const userData = await api.getMe();
              setUser(userData);
            } catch {
              api.clearTokens();
            }
          } else {
            api.clearTokens();
          }
        }
      } else {
        // No access token in memory, but the httpOnly refresh cookie may still
        // be valid (e.g. user returned after closing the tab). Attempt a silent
        // refresh to restore the session.
        const refreshed = await api.refreshAccessToken();
        if (refreshed) {
          try {
            const userData = await api.getMe();
            setUser(userData);
          } catch {
            api.clearTokens();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    const data = await api.signup(email, password, displayName);
    setUser(data.user);
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error('Logout API failed:', err);
    } finally {
      setUser(null);
    }
  }, []);

  const googleLogin = useCallback(async (credential) => {
    const data = await api.googleAuth(credential);
    setUser(data.user);
    return data;
  }, []);

  const updateUser = useCallback((userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signup,
    login,
    googleLogin,
    logout,
    updateUser,
    isAuthenticated: !!user
  }), [user, loading, signup, login, googleLogin, logout, updateUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication context.
 * Must be used within an AuthProvider.
 *
 * @returns {AuthContextValue} Authentication context value
 * @throws {Error} If used outside of AuthProvider
 *
 * @example
 * const { user, login, logout, isAuthenticated } = useAuth();
 *
 * if (isAuthenticated) {
 *   console.log(`Hello, ${user.displayName}`);
 * }
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
