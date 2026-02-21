import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all announcements for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { pinnedOnly } = req.query;

    const announcements = await prisma.announcement.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        ...(pinnedOnly === 'true' && { isPinned: true })
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
      ]
    });

    // Add user's acknowledgment status
    const result = announcements.map(a => ({
      ...a,
      isAcknowledged: a.acknowledgments.some(ack => ack.user.id === req.user.id),
      acknowledgmentCount: a._count.acknowledgments
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

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        priority: priority || 'normal',
        isPinned: isPinned !== false,
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
