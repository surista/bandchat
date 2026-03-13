import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import { useDatabase } from './DatabaseContext';
import api from '../services/api';
import { register as registerSocketSync, unregister as unregisterSocketSync } from '../services/socketSyncHandler';
import { processQueue } from '../services/syncQueue';

const SocketContext = createContext(null);

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl || 'http://localhost:3001';
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function SocketProvider({ children }) {
  const { isAuthenticated, isOffline } = useAuth();
  const { isReady: dbReady } = useDatabase();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);
  const refreshingToken = useRef(false);

  useEffect(() => {
    // Don't connect if not authenticated, no token, or offline
    if (!isAuthenticated || !api.accessToken || isOffline) {
      return;
    }

    // Clear any pending reconnect
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    const newSocket = io(SOCKET_URL, {
      auth: (cb) => {
        // Always get the latest token
        cb({ token: api.accessToken });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
    });

    newSocket.on('connect', () => {
      setConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
      // Register socket → SQLite sync and flush offline queue
      if (dbReady) {
        registerSocketSync(newSocket);
        processQueue().catch(() => {});
      }
    });

    newSocket.on('disconnect', (reason) => {
      setConnected(false);
      // If server disconnected us, don't auto-reconnect
      if (reason === 'io server disconnect') {
        setError('Disconnected by server');
      }
    });

    newSocket.on('connect_error', async (socketError) => {
      setConnected(false);
      reconnectAttempts.current++;

      if (socketError.message?.includes('Authentication') || socketError.message?.includes('token')) {
        // Prevent concurrent token refresh attempts
        if (refreshingToken.current) return;
        refreshingToken.current = true;
        try {
          const refreshed = await api.refreshAccessToken();
          if (refreshed) {
            // Token refreshed, socket will auto-reconnect with new token
            reconnectAttempts.current = 0;
          } else {
            setError('Session expired');
          }
        } catch (e) {
          setError('Authentication failed');
        } finally {
          refreshingToken.current = false;
        }
      } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setError('Connection failed after multiple attempts');
      }
    });

    setSocket(newSocket);

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      unregisterSocketSync(newSocket);
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated, isOffline, dbReady]);

  const joinChannel = useCallback((channelId) => {
    if (socket) socket.emit('channel:join', channelId);
  }, [socket]);

  const leaveChannel = useCallback((channelId) => {
    if (socket) socket.emit('channel:leave', channelId);
  }, [socket]);

  const startTyping = useCallback((channelId) => {
    if (socket) socket.emit('typing:start', channelId);
  }, [socket]);

  const stopTyping = useCallback((channelId) => {
    if (socket) socket.emit('typing:stop', channelId);
  }, [socket]);

  const joinWorkspace = useCallback((workspaceId) => {
    if (socket) socket.emit('workspace:join', workspaceId);
  }, [socket]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(() => ({
    socket,
    connected,
    error,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
    joinWorkspace,
    clearError,
  }), [socket, connected, error, joinChannel, leaveChannel, startTyping, stopTyping, joinWorkspace, clearError]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;
