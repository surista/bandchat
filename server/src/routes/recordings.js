import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all recordings for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { songId, type } = req.query;

    const where = { workspaceId: req.params.workspaceId };
    if (songId) where.songId = songId;
    if (type) where.type = type;

    const recordings = await prisma.recording.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        song: {
          select: { id: true, title: true, artist: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(recordings);
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// Get recordings for a specific song
router.get('/song/:songId', authenticate, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: song.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const recordings = await prisma.recording.findMany({
      where: { songId: req.params.songId },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(recordings);
  } catch (error) {
    console.error('Error fetching song recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// Create a recording
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, description, url, type, duration, songId } = req.body;

    if (!title || !url || !type) {
      return res.status(400).json({ error: 'Title, URL, and type are required' });
    }

    if (!['audio', 'video'].includes(type)) {
      return res.status(400).json({ error: 'Type must be audio or video' });
    }

    // Verify song belongs to workspace if provided
    if (songId) {
      const song = await prisma.song.findFirst({
        where: {
          id: songId,
          workspaceId: req.params.workspaceId
        }
      });

      if (!song) {
        return res.status(400).json({ error: 'Song not found in this workspace' });
      }
    }

    const recording = await prisma.recording.create({
      data: {
        title,
        description,
        url,
        type,
        duration,
        songId,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        song: {
          select: { id: true, title: true, artist: true }
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('recording:created', recording);

    res.status(201).json(recording);
  } catch (error) {
    console.error('Error creating recording:', error);
    res.status(500).json({ error: 'Failed to create recording' });
  }
});

// Update a recording
router.put('/:recordingId', authenticate, async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.recordingId }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: recording.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only creator or admin can update
    if (recording.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, songId } = req.body;

    // Verify song belongs to workspace if provided
    if (songId) {
      const song = await prisma.song.findFirst({
        where: {
          id: songId,
          workspaceId: recording.workspaceId
        }
      });

      if (!song) {
        return res.status(400).json({ error: 'Song not found in this workspace' });
      }
    }

    const updated = await prisma.recording.update({
      where: { id: req.params.recordingId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(songId !== undefined && { songId })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        song: {
          select: { id: true, title: true, artist: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${recording.workspaceId}`).emit('recording:updated', updated);

    res.json(updated);
  } catch (error) {
    console.error('Error updating recording:', error);
    res.status(500).json({ error: 'Failed to update recording' });
  }
});

// Delete a recording
router.delete('/:recordingId', authenticate, async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.recordingId }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: recording.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only creator or admin can delete
    if (recording.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.recording.delete({
      where: { id: req.params.recordingId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${recording.workspaceId}`).emit('recording:deleted', { id: req.params.recordingId });

    res.json({ message: 'Recording deleted' });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

export default router;
