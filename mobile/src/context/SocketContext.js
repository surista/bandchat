import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import api from '../services/api';

const SocketContext = createContext(null);

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl || 'http://localhost:3001';

export function SocketProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (isAuthenticated && api.accessToken) {
      const newSocket = io(SOCKET_URL, {
        auth: (cb) => {
          cb({ token: api.accessToken });
        },
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        setConnected(false);
      });

      newSocket.on('connect_error', async (error) => {
        setConnected(false);
        if (error.message?.includes('Authentication') || error.message?.includes('token')) {
          try { await api.refreshAccessToken(); } catch (e) {}
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
        setSocket(null);
      };
    }
  }, [isAuthenticated]);

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

  const value = useMemo(() => ({
    socket,
    connected,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
    joinWorkspace,
  }), [socket, connected, joinChannel, leaveChannel, startTyping, stopTyping, joinWorkspace]);

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
