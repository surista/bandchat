/**
 * @fileoverview Socket.IO context provider for real-time communication.
 * Manages WebSocket connection, room joining, and typing indicators.
 */

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';

/**
 * @typedef {Object} SocketContextValue
 * @property {import('socket.io-client').Socket|null} socket - Socket.IO client instance
 * @property {boolean} connected - Whether socket is currently connected
 * @property {function(string): void} joinChannel - Join a channel room
 * @property {function(string): void} leaveChannel - Leave a channel room
 * @property {function(string): void} startTyping - Emit typing start event
 * @property {function(string): void} stopTyping - Emit typing stop event
 * @property {function(string): void} joinWorkspace - Join a workspace room
 */

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

/**
 * Socket.IO provider component.
 * Automatically connects/disconnects based on authentication state.
 * Provides methods for joining rooms and typing indicators.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export function SocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (isAuthenticated && api.accessToken) {
      const newSocket = io(SOCKET_URL, {
        auth: (cb) => {
          // Provide fresh token on every connect/reconnect
          cb({ token: api.accessToken });
        },
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        if (import.meta.env.DEV) console.log('Socket connected');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        if (import.meta.env.DEV) console.log('Socket disconnected');
        setConnected(false);
      });

      newSocket.on('connect_error', async (error) => {
        if (import.meta.env.DEV) console.error('Socket connection error:', error);
        setConnected(false);
        // If auth failed, try refreshing the token before next reconnect
        if (error.message?.includes('Authentication') || error.message?.includes('token')) {
          try {
            await api.refreshAccessToken();
          } catch (e) {
            // Token refresh failed — user will need to re-login
          }
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
    joinWorkspace
  }), [socket, connected, joinChannel, leaveChannel, startTyping, stopTyping, joinWorkspace]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Hook to access Socket.IO context.
 * Must be used within a SocketProvider.
 *
 * @returns {SocketContextValue} Socket context value
 * @throws {Error} If used outside of SocketProvider
 *
 * @example
 * const { socket, connected, joinChannel } = useSocket();
 *
 * useEffect(() => {
 *   if (socket) {
 *     socket.on('message:new', handleNewMessage);
 *     return () => socket.off('message:new', handleNewMessage);
 *   }
 * }, [socket]);
 */
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;
