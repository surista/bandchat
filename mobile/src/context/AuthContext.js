import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await api.loadTokens();
        if (api.accessToken) {
          const userData = await api.getMe();
          setUser(userData);
        }
      } catch {
        await api.clearTokens();
      } finally {
        setLoading(false);
      }
    };

    api.onSessionExpired = () => {
      setUser(null);
      api.clearTokens();
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

  const updateUser = useCallback((userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signup,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
  }), [user, loading, signup, login, logout, updateUser]);

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
