import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      socket.leave(`channel:${channelId}`);
      console.log(`${user.displayName} left channel ${channelId}`);
    });

    // Handle typing indicator
    socket.on('typing:start', async (channelId) => {
      socket.to(`channel:${channelId}`).emit('typing:start', {
        channelId,
        user: {
          id: user.id,
          displayName: user.displayName
        }
      });
    });

    socket.on('typing:stop', (channelId) => {
      socket.to(`channel:${channelId}`).emit('typing:stop', {
        channelId,
        userId: user.id
      });
    });

    // Handle presence updates
    socket.on('presence:update', async (status) => {
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
