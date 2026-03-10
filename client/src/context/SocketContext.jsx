/**
 * @fileoverview Socket.IO context provider for real-time communication.
 * Manages WebSocket connection, room joining, and typing indicators.
 */

import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  const [presenceMap, setPresenceMap] = useState({});
  const idleTimerRef = useRef(null);
  const isAwayRef = useRef(false);
  const lastResetRef = useRef(0);

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
        newSocket.emit('presence:update', 'online');
      });

      newSocket.on('disconnect', () => {
        if (import.meta.env.DEV) console.log('Socket disconnected');
        setConnected(false);
      });

      // Listen for presence updates from other users
      newSocket.on('presence:updated', ({ userId, status }) => {
        setPresenceMap(prev => ({ ...prev, [userId]: status }));
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

      // Idle detection: go away after 5 min of inactivity
      const IDLE_TIMEOUT = 5 * 60 * 1000;
      const resetIdle = () => {
        const now = Date.now();
        if (now - lastResetRef.current < 5000) return;
        lastResetRef.current = now;
        if (isAwayRef.current) {
          isAwayRef.current = false;
          newSocket.emit('presence:update', 'online');
        }
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          isAwayRef.current = true;
          newSocket.emit('presence:update', 'away');
        }, IDLE_TIMEOUT);
      };
      const handleVisibility = () => {
        if (document.hidden) {
          isAwayRef.current = true;
          newSocket.emit('presence:update', 'away');
        } else {
          resetIdle();
        }
      };

      window.addEventListener('mousemove', resetIdle);
      window.addEventListener('keydown', resetIdle);
      document.addEventListener('visibilitychange', handleVisibility);
      resetIdle();

      return () => {
        clearTimeout(idleTimerRef.current);
        window.removeEventListener('mousemove', resetIdle);
        window.removeEventListener('keydown', resetIdle);
        document.removeEventListener('visibilitychange', handleVisibility);
        newSocket.disconnect();
        setSocket(null);
        setPresenceMap({});
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
    presenceMap
  }), [socket, connected, joinChannel, leaveChannel, startTyping, stopTyping, joinWorkspace, presenceMap]);

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
