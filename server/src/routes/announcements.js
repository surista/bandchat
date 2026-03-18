import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { sendPushToUser } from './push.js';

const router = express.Router();

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

// Get all announcements for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { pinnedOnly } = req.query;

    const announcements = await prisma.announcement.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        ...(pinnedOnly === 'true' && { isPinned: true }),
        // Exclude expired announcements
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } }
        ]
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        acknowledgments: {
          include: {
            user: {
              select: { id: true, displayName: true }
            }
          }
        },
        _count: {
          select: { acknowledgments: true }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 100
    });

    // Get total workspace member count
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId: req.params.workspaceId }
    });

    // Add user's acknowledgment status and member count
    const result = announcements.map(a => ({
      ...a,
      isAcknowledged: a.acknowledgments.some(ack => ack.user.id === req.user.id),
      acknowledgmentCount: a._count.acknowledgments,
      memberCount
    }));

    res.json(result);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to get announcements' });
  }
});

// Create an announcement (admin only)
router.post('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { title, content, priority, isPinned, expiresAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (content.length > 10000) return res.status(400).json({ error: 'Content must be 10,000 characters or less' });

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be low, normal, high, or urgent' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        priority: priority || 'normal',
        isPinned: isPinned === true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('announcement:created', announcement);

    // Send push notification to workspace members
    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params.workspaceId, userId: { not: req.user.id } },
      select: { userId: true }
    });
    wsMembers.forEach(m => {
      sendPushToUser(m.userId, {
        title: 'Announcement',
        body: announcement.title.length > 100 ? announcement.title.substring(0, 100) + '...' : announcement.title,
        tag: `announcement-${announcement.id}`,
        url: `/workspace/${req.params.workspaceId}`,
        workspaceId: req.params.workspaceId,
        threadId: req.params.workspaceId
      }, { category: 'announcement', workspaceId: req.params.workspaceId });
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Get a single announcement
router.get('/:announcementId', authenticate, async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.announcementId },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        acknowledgments: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true }
            }
          },
          orderBy: { acknowledgedAt: 'desc' }
        }
      }
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: announcement.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json({
      ...announcement,
      isAcknowledged: announcement.acknowledgments.some(ack => ack.user.id === req.user.id)
    });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Failed to get announcement' });
  }
});

// Update an announcement (admin only)
router.put('/:announcementId', authenticate, async (req, res) => {
  try {
    const { title, content, priority, isPinned, expiresAt } = req.body;

    const existing = await prisma.announcement.findUnique({
      where: { id: req.params.announcementId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Check admin status
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.workspaceId
        }
      }
    });

    if (member?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Input length validation
    if (title && title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (content && content.length > 10000) return res.status(400).json({ error: 'Content must be 10,000 characters or less' });

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be low, normal, high, or urgent' });
    }

    const announcement = await prisma.announcement.update({
      where: { id: req.params.announcementId },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(priority !== undefined && { priority }),
        ...(isPinned !== undefined && { isPinned }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${announcement.workspaceId}`).emit('announcement:updated', announcement);

    res.json(announcement);
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Acknowledge an announcement
router.post('/:announcementId/acknowledge', authenticate, async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.announcementId }
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: announcement.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Check if already acknowledged
    const existing = await prisma.announcementAcknowledgment.findUnique({
      where: {
        announcementId_userId: {
          announcementId: req.params.announcementId,
          userId: req.user.id
        }
      }
    });

    if (existing) {
      return res.json({ message: 'Already acknowledged' });
    }

    const acknowledgment = await prisma.announcementAcknowledgment.create({
      data: {
        announcementId: req.params.announcementId,
        userId: req.user.id
      },
      include: {
        user: {
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast acknowledgment
    const io = req.app.get('io');
    io.to(`workspace:${announcement.workspaceId}`).emit('announcement:acknowledged', {
      announcementId: req.params.announcementId,
      acknowledgment
    });

    res.status(201).json(acknowledgment);
  } catch (error) {
    console.error('Acknowledge announcement error:', error);
    res.status(500).json({ error: 'Failed to acknowledge announcement' });
  }
});

// Delete an announcement (admin only)
router.delete('/:announcementId', authenticate, async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.announcementId }
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Check admin status
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: announcement.workspaceId
        }
      }
    });

    if (member?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.announcement.delete({
      where: { id: req.params.announcementId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${announcement.workspaceId}`).emit('announcement:deleted', {
      announcementId: req.params.announcementId
    });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
