import express from 'express';
import { authenticate, isWorkspaceMember, isChannelMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get channels for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        OR: [
          { isPrivate: false },
          {
            members: {
              some: { userId: req.user.id }
            }
          }
        ]
      },
      include: {
        _count: {
          select: { members: true, messages: true }
        },
        members: {
          where: { userId: req.user.id },
          select: { muted: true, lastRead: true }
        },
        group: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }]
    });

    // Get unread counts
    const channelsWithUnread = await Promise.all(
      channels.map(async (channel) => {
        const userMembership = channel.members[0];
        const lastRead = userMembership?.lastRead || new Date(0);

        const unreadCount = await prisma.message.count({
          where: {
            channelId: channel.id,
            createdAt: { gt: lastRead },
            authorId: { not: req.user.id }
          }
        });

        return {
          ...channel,
          groupId: channel.group?.id || null,
          muted: userMembership?.muted || false,
          unreadCount,
          members: undefined
        };
      })
    );

    res.json(channelsWithUnread);
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

// Create channel
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, description, isPrivate, memberIds, groupId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    // Validate channel name (lowercase, no spaces)
    const channelName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (channelName.length === 0) {
      return res.status(400).json({ error: 'Invalid channel name' });
    }

    // Check if channel name already exists in workspace
    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId: req.params.workspaceId,
        name: channelName
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Channel name already exists' });
    }

    // Create channel with members
    const membersToAdd = [req.user.id];
    if (memberIds && Array.isArray(memberIds)) {
      // Verify all members are in the workspace
      const validMembers = await prisma.workspaceMember.findMany({
        where: {
          workspaceId: req.params.workspaceId,
          userId: { in: memberIds }
        }
      });
      membersToAdd.push(...validMembers.map(m => m.userId).filter(id => id !== req.user.id));
    }

    const channel = await prisma.channel.create({
      data: {
        name: channelName,
        description,
        isPrivate: isPrivate || false,
        workspaceId: req.params.workspaceId,
        groupId: groupId || null,
        members: {
          create: membersToAdd.map(userId => ({ userId }))
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        group: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: { messages: true }
        }
      }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('channel:created', channel);

    res.status(201).json(channel);
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Get channel by ID
router.get('/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        _count: {
          select: { messages: true }
        }
      }
    });

    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// Update channel
router.put('/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { name, description } = req.body;

    const channel = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: {
        ...(name && { name: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }),
        ...(description !== undefined && { description })
      }
    });

    // Notify channel members
    const io = req.app.get('io');
    io.to(`channel:${req.params.channelId}`).emit('channel:updated', channel);

    res.json(channel);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Channel name already exists' });
    }
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete channel
router.delete('/:channelId', authenticate, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is workspace admin
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: channel.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Can't delete the general channel
    if (channel.name === 'general') {
      return res.status(400).json({ error: 'Cannot delete the general channel' });
    }

    await prisma.channel.delete({
      where: { id: req.params.channelId }
    });

    // Notify workspace members
    const io = req.app.get('io');
    io.to(`workspace:${channel.workspaceId}`).emit('channel:deleted', {
      channelId: req.params.channelId
    });

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Add member to channel
router.post('/:channelId/members', authenticate, isChannelMember, async (req, res) => {
  try {
    const { userId } = req.body;
    const channel = req.channel;

    // Verify user is in the workspace
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(400).json({ error: 'User is not in this workspace' });
    }

    const member = await prisma.channelMember.create({
      data: {
        userId,
        channelId: req.params.channelId
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });

    // Notify channel
    const io = req.app.get('io');
    io.to(`channel:${req.params.channelId}`).emit('channel:member:added', {
      channelId: req.params.channelId,
      member
    });

    res.status(201).json(member);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a member' });
    }
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from channel
router.delete('/:channelId/members/:userId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { channelId, userId } = req.params;

    await prisma.channelMember.delete({
      where: {
        userId_channelId: { userId, channelId }
      }
    });

    // Notify channel
    const io = req.app.get('io');
    io.to(`channel:${channelId}`).emit('channel:member:removed', {
      channelId,
      userId
    });

    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Mute/unmute channel
router.put('/:channelId/mute', authenticate, isChannelMember, async (req, res) => {
  try {
    const { muted } = req.body;

    await prisma.channelMember.update({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: req.params.channelId
        }
      },
      data: { muted }
    });

    res.json({ muted });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mute setting' });
  }
});

// Mark channel as read
router.post('/:channelId/read', authenticate, isChannelMember, async (req, res) => {
  try {
    await prisma.channelMember.update({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: req.params.channelId
        }
      },
      data: { lastRead: new Date() }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
