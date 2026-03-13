import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { openDatabase, closeDatabase, getDatabase } from '../services/database';

const DatabaseContext = createContext(null);

export function DatabaseProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      openDatabase(user.id)
        .then(() => setIsReady(true))
        .catch((err) => {
          console.warn('Failed to open database:', err.message);
          // App still works without local DB — just won't have offline support
          setIsReady(true);
        });
    } else {
      // User logged out — close DB
      closeDatabase().then(() => setIsReady(false));
    }
  }, [isAuthenticated, user?.id]);

  const value = useMemo(() => ({
    db: getDatabase(),
    isReady,
  }), [isReady]);

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

export default DatabaseContext;
