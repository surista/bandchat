import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

/**
 * Simple in-memory rate limiter for Socket.IO events.
 * Tracks event counts per user within a sliding time window.
 */
class SocketRateLimiter {
  constructor() {
    this.limits = new Map(); // userId -> { eventName -> { count, resetTime } }
  }

  /**
   * Check if an event is allowed for a user.
   * @param {string} userId - User ID
   * @param {string} eventName - Event name to rate limit
   * @param {number} maxEvents - Maximum events allowed in window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} - Whether the event is allowed
   */
  isAllowed(userId, eventName, maxEvents, windowMs) {
    const now = Date.now();
    const key = `${userId}:${eventName}`;

    if (!this.limits.has(key)) {
      this.limits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    const limit = this.limits.get(key);

    // Reset if window has passed
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return true;
    }

    // Check if under limit
    if (limit.count < maxEvents) {
      limit.count++;
      return true;
    }

    return false;
  }

  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, limit] of this.limits) {
      if (now > limit.resetTime + 60000) { // Keep for 1 min after expiry
        this.limits.delete(key);
      }
    }
  }
}

// Global rate limiter instance
const rateLimiter = new SocketRateLimiter();

// Cleanup old rate limit entries every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

// Rate limit configurations (events per minute)
const RATE_LIMITS = {
  'channel:join': { max: 30, windowMs: 60000 },
  'channel:leave': { max: 30, windowMs: 60000 },
  'typing:start': { max: 60, windowMs: 60000 },
  'typing:stop': { max: 60, windowMs: 60000 },
  'presence:update': { max: 20, windowMs: 60000 },
  'workspace:join': { max: 10, windowMs: 60000 }
};

export const setupSocketHandlers = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true
        }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`User connected: ${user.displayName} (${user.id})`);

    // Join user's personal room for direct notifications
    socket.join(`user:${user.id}`);

    // Get user's workspaces and join their rooms
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          include: {
            channels: {
              where: {
                OR: [
                  { isPrivate: false },
                  {
                    members: {
                      some: { userId: user.id }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    });

    // Join workspace and channel rooms
    memberships.forEach(membership => {
      socket.join(`workspace:${membership.workspaceId}`);
      membership.workspace.channels.forEach(channel => {
        socket.join(`channel:${channel.id}`);
      });
    });

    // Handle joining a channel
    socket.on('channel:join', async (channelId) => {
      // Rate limit check
      if (!rateLimiter.isAllowed(user.id, 'channel:join', RATE_LIMITS['channel:join'].max, RATE_LIMITS['channel:join'].windowMs)) {
        return; // Silently drop rate-limited requests
      }

      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId }
        });

        if (!channel) return;

        // Verify membership
        if (channel.isPrivate) {
          const membership = await prisma.channelMember.findUnique({
            where: {
              userId_channelId: {
                userId: user.id,
                channelId
              }
            }
          });

          if (!membership) return;
        } else {
          // For public channels, check workspace membership
          const workspaceMembership = await prisma.workspaceMember.findUnique({
            where: {
              userId_workspaceId: {
                userId: user.id,
                workspaceId: channel.workspaceId
              }
            }
          });

          if (!workspaceMembership) return;
        }

        socket.join(`channel:${channelId}`);
        console.log(`${user.displayName} joined channel ${channelId}`);
      } catch (error) {
        console.error('Channel join error:', error);
      }
    });

    // Handle leaving a channel
    socket.on('channel:leave', (channelId) => {
      if (!rateLimiter.isAllowed(user.id, 'channel:leave', RATE_LIMITS['channel:leave'].max, RATE_LIMITS['channel:leave'].windowMs)) {
        return;
      }
      socket.leave(`channel:${channelId}`);
      console.log(`${user.displayName} left channel ${channelId}`);
    });

    // Handle typing indicator
    socket.on('typing:start', async (channelId) => {
      if (!rateLimiter.isAllowed(user.id, 'typing:start', RATE_LIMITS['typing:start'].max, RATE_LIMITS['typing:start'].windowMs)) {
        return;
      }
      socket.to(`channel:${channelId}`).emit('typing:start', {
        channelId,
        user: {
          id: user.id,
          displayName: user.displayName
        }
      });
    });

    socket.on('typing:stop', (channelId) => {
      if (!rateLimiter.isAllowed(user.id, 'typing:stop', RATE_LIMITS['typing:stop'].max, RATE_LIMITS['typing:stop'].windowMs)) {
        return;
      }
      socket.to(`channel:${channelId}`).emit('typing:stop', {
        channelId,
        userId: user.id
      });
    });

    // Handle presence updates
    socket.on('presence:update', async (status) => {
      if (!rateLimiter.isAllowed(user.id, 'presence:update', RATE_LIMITS['presence:update'].max, RATE_LIMITS['presence:update'].windowMs)) {
        return;
      }
      // Broadcast to all workspaces user is in
      memberships.forEach(membership => {
        socket.to(`workspace:${membership.workspaceId}`).emit('presence:updated', {
          userId: user.id,
          status
        });
      });
    });

    // Handle joining a workspace (after accepting an invite)
    socket.on('workspace:join', async (workspaceId) => {
      if (!rateLimiter.isAllowed(user.id, 'workspace:join', RATE_LIMITS['workspace:join'].max, RATE_LIMITS['workspace:join'].windowMs)) {
        return;
      }
      try {
        const membership = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: {
              userId: user.id,
              workspaceId
            }
          },
          include: {
            workspace: {
              include: {
                channels: {
                  where: { isPrivate: false }
                }
              }
            }
          }
        });

        if (membership) {
          socket.join(`workspace:${workspaceId}`);
          membership.workspace.channels.forEach(channel => {
            socket.join(`channel:${channel.id}`);
          });
        }
      } catch (error) {
        console.error('Workspace join error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.displayName}`);

      // Notify workspaces about offline status
      memberships.forEach(membership => {
        socket.to(`workspace:${membership.workspaceId}`).emit('presence:updated', {
          userId: user.id,
          status: 'offline'
        });
      });
    });
  });
};
