import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { isValidUUID, isValidRecordingType } from '../lib/validators.js';

const router = express.Router();

// Get all recordings for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { songId, type } = req.query;

    const where = { workspaceId: req.params.workspaceId };

    // Validate songId if provided
    if (songId) {
      if (!isValidUUID(songId)) {
        return res.status(400).json({ error: 'Invalid song ID format' });
      }
      where.songId = songId;
    }

    // Validate type if provided
    if (type) {
      if (!isValidRecordingType(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be audio or video' });
      }
      where.type = type;
    }

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
      orderBy: { createdAt: 'desc' },
      take: 200
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
    const { songId } = req.params;

    // Validate songId format first
    if (!isValidUUID(songId)) {
      return res.status(400).json({ error: 'Invalid song ID format' });
    }

    // Single query that verifies both song existence AND workspace membership
    // This prevents information leakage about songs in other workspaces
    const song = await prisma.song.findFirst({
      where: {
        id: songId,
        workspace: {
          members: {
            some: { userId: req.user.id }
          }
        }
      },
      select: { id: true }
    });

    // Return same error whether song doesn't exist or user isn't a member
    // This prevents enumeration attacks
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const recordings = await prisma.recording.findMany({
      where: { songId },
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

    // Validate that URL is from an allowed upload provider
    const urlCheck = isAllowedUploadUrl(url);
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error || 'Invalid URL' });
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
    const { recordingId } = req.params;

    // Validate recordingId format
    if (!isValidUUID(recordingId)) {
      return res.status(400).json({ error: 'Invalid recording ID format' });
    }

    // Single query that fetches recording AND verifies workspace membership
    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        workspace: {
          members: {
            some: { userId: req.user.id }
          }
        }
      },
      include: {
        workspace: {
          select: {
            members: {
              where: { userId: req.user.id },
              select: { role: true }
            }
          }
        }
      }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const membership = recording.workspace.members[0];

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
    const { recordingId } = req.params;

    // Validate recordingId format
    if (!isValidUUID(recordingId)) {
      return res.status(400).json({ error: 'Invalid recording ID format' });
    }

    // Single query that fetches recording AND verifies workspace membership
    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        workspace: {
          members: {
            some: { userId: req.user.id }
          }
        }
      },
      include: {
        workspace: {
          select: {
            members: {
              where: { userId: req.user.id },
              select: { role: true }
            }
          }
        }
      }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const membership = recording.workspace.members[0];

    // Only creator or admin can delete
    if (recording.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Clean up R2 file and decrement storage
    if (isR2Url(recording.url)) {
      try { await deleteFile(recording.url); } catch { /* best effort */ }
    }
    if (recording.size) {
      await safeDecrementStorage(recording.workspaceId, recording.size).catch(() => {});
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
