import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all channel groups for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const groups = await prisma.channelGroup.findMany({
      where: { workspaceId: req.params.workspaceId },
      orderBy: { position: 'asc' },
      include: {
        channels: {
          where: {
            OR: [
              { isPrivate: false },
              {
                members: {
                  some: { userId: req.user.id }
                }
              }
            ]
          },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            isPrivate: true,
            position: true
          }
        }
      }
    });

    res.json(groups);
  } catch (error) {
    console.error('Get channel groups error:', error);
    res.status(500).json({ error: 'Failed to get channel groups' });
  }
});

// Create a channel group
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Get highest position
    const lastGroup = await prisma.channelGroup.findFirst({
      where: { workspaceId: req.params.workspaceId },
      orderBy: { position: 'desc' }
    });

    const group = await prisma.channelGroup.create({
      data: {
        name: name.trim(),
        workspaceId: req.params.workspaceId,
        position: (lastGroup?.position ?? -1) + 1
      },
      include: {
        channels: true
      }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('channelGroup:created', group);

    res.status(201).json(group);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    console.error('Create channel group error:', error);
    res.status(500).json({ error: 'Failed to create channel group' });
  }
});

// Update a channel group
router.put('/:groupId', authenticate, async (req, res) => {
  try {
    const { name, position, isCollapsed } = req.body;

    const group = await prisma.channelGroup.findUnique({
      where: { id: req.params.groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: group.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const updated = await prisma.channelGroup.update({
      where: { id: req.params.groupId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(position !== undefined && { position }),
        ...(isCollapsed !== undefined && { isCollapsed })
      },
      include: {
        channels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            isPrivate: true,
            position: true
          }
        }
      }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${group.workspaceId}`).emit('channelGroup:updated', updated);

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Group name already exists' });
    }
    console.error('Update channel group error:', error);
    res.status(500).json({ error: 'Failed to update channel group' });
  }
});

// Delete a channel group
router.delete('/:groupId', authenticate, async (req, res) => {
  try {
    const group = await prisma.channelGroup.findUnique({
      where: { id: req.params.groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is workspace admin
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: group.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Move channels out of group before deleting
    await prisma.channel.updateMany({
      where: { groupId: req.params.groupId },
      data: { groupId: null }
    });

    await prisma.channelGroup.delete({
      where: { id: req.params.groupId }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${group.workspaceId}`).emit('channelGroup:deleted', {
      groupId: req.params.groupId
    });

    res.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('Delete channel group error:', error);
    res.status(500).json({ error: 'Failed to delete channel group' });
  }
});

// Move channel to a group
router.put('/:groupId/channels/:channelId', authenticate, async (req, res) => {
  try {
    const { groupId, channelId } = req.params;
    const { position } = req.body;

    const group = await prisma.channelGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const channel = await prisma.channel.findUnique({
      where: { id: channelId }
    });

    if (!channel || channel.workspaceId !== group.workspaceId) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    // Verify user is workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: group.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: {
        groupId,
        ...(position !== undefined && { position })
      }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${group.workspaceId}`).emit('channel:moved', {
      channelId,
      groupId,
      position: updated.position
    });

    res.json(updated);
  } catch (error) {
    console.error('Move channel error:', error);
    res.status(500).json({ error: 'Failed to move channel' });
  }
});

// Remove channel from group (move to ungrouped)
router.delete('/channels/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Verify user is workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: channel.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: { groupId: null }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${channel.workspaceId}`).emit('channel:moved', {
      channelId,
      groupId: null,
      position: updated.position
    });

    res.json(updated);
  } catch (error) {
    console.error('Remove channel from group error:', error);
    res.status(500).json({ error: 'Failed to remove channel from group' });
  }
});

export default router;
