import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

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
      };
    } else {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
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

  const value = {
    socket,
    connected,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
    joinWorkspace
  };

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
