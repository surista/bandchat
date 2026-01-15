import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all songs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const songs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        _count: {
          select: { setlistSongs: true, gigSongs: true }
        }
      },
      orderBy: { title: 'asc' }
    });

    res.json(songs);
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: 'Failed to get songs' });
  }
});

// Create a song
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, artist, duration, key, bpm, notes, youtubeUrl, spotifyUrl } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        duration,
        key,
        bpm,
        notes,
        youtubeUrl,
        spotifyUrl,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('song:created', song);

    res.status(201).json(song);
  } catch (error) {
    console.error('Create song error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A song with this title and artist already exists' });
    }
    res.status(500).json({ error: 'Failed to create song' });
  }
});

// Get a single song
router.get('/:songId', authenticate, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlistSongs: {
          include: {
            setlist: {
              select: { id: true, name: true }
            }
          }
        },
        gigSongs: {
          include: {
            gig: {
              select: { id: true, title: true, date: true }
            }
          }
        }
      }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json(song);
  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: 'Failed to get song' });
  }
});

// Update a song
router.put('/:songId', authenticate, async (req, res) => {
  try {
    const { title, artist, duration, key, bpm, notes, youtubeUrl, spotifyUrl } = req.body;

    const song = await prisma.song.update({
      where: { id: req.params.songId },
      data: {
        ...(title && { title }),
        ...(artist !== undefined && { artist }),
        ...(duration !== undefined && { duration }),
        ...(key !== undefined && { key }),
        ...(bpm !== undefined && { bpm }),
        ...(notes !== undefined && { notes }),
        ...(youtubeUrl !== undefined && { youtubeUrl }),
        ...(spotifyUrl !== undefined && { spotifyUrl })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:updated', song);

    res.json(song);
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ error: 'Failed to update song' });
  }
});

// Delete a song
router.delete('/:songId', authenticate, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    await prisma.song.delete({
      where: { id: req.params.songId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:deleted', { songId: req.params.songId });

    res.json({ message: 'Song deleted' });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

export default router;
