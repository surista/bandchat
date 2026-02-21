/**
 * @fileoverview Socket.IO context provider for real-time communication.
 * Manages WebSocket connection, room joining, and typing indicators.
 */

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
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
        auth: {
          token: api.accessToken
        },
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setConnected(false);
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
        setSocket(null);
      };
    }
  }, [isAuthenticated]);

  const joinChannel = (channelId) => {
    if (socket) {
      socket.emit('channel:join', channelId);
    }
  };

  const leaveChannel = (channelId) => {
    if (socket) {
      socket.emit('channel:leave', channelId);
    }
  };

  const startTyping = (channelId) => {
    if (socket) {
      socket.emit('typing:start', channelId);
    }
  };

  const stopTyping = (channelId) => {
    if (socket) {
      socket.emit('typing:stop', channelId);
    }
  };

  const joinWorkspace = (workspaceId) => {
    if (socket) {
      socket.emit('workspace:join', workspaceId);
    }
  };

  const value = useMemo(() => ({
    socket,
    connected,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
    joinWorkspace
  }), [socket, connected]);

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
