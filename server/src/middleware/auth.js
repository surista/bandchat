import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
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
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const isWorkspaceMember = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    req.workspaceMembership = membership;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization failed' });
  }
};

export const isWorkspaceAdmin = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.workspaceMembership = membership;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization failed' });
  }
};

export const isChannelMember = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          where: { userId }
        }
      }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // For public channels, just check workspace membership
    if (!channel.isPrivate) {
      const workspaceMembership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: channel.workspaceId }
        }
      });

      if (!workspaceMembership) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }
    } else {
      // For private channels, check channel membership
      if (channel.members.length === 0) {
        return res.status(403).json({ error: 'Not a member of this channel' });
      }
    }

    req.channel = channel;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization failed' });
  }
};
