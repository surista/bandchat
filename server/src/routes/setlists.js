import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all setlists for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const setlists = await prisma.setlist.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: true
          },
          orderBy: { position: 'asc' }
        },
        _count: {
          select: { gigs: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(setlists);
  } catch (error) {
    console.error('Get setlists error:', error);
    res.status(500).json({ error: 'Failed to get setlists' });
  }
});

// Create a setlist
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const setlist = await prisma.setlist.create({
      data: {
        name,
        description,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('setlist:created', setlist);

    res.status(201).json(setlist);
  } catch (error) {
    console.error('Create setlist error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A setlist with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create setlist' });
  }
});

// Get a single setlist with songs
router.get('/:setlistId', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: true
          },
          orderBy: { position: 'asc' }
        },
        gigs: {
          select: { id: true, title: true, date: true, status: true },
          orderBy: { date: 'desc' }
        }
      }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    res.json(setlist);
  } catch (error) {
    console.error('Get setlist error:', error);
    res.status(500).json({ error: 'Failed to get setlist' });
  }
});

// Update a setlist
router.put('/:setlistId', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;

    const setlist = await prisma.setlist.update({
      where: { id: req.params.setlistId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:updated', setlist);

    res.json(setlist);
  } catch (error) {
    console.error('Update setlist error:', error);
    res.status(500).json({ error: 'Failed to update setlist' });
  }
});

// Delete a setlist
router.delete('/:setlistId', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    await prisma.setlist.delete({
      where: { id: req.params.setlistId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:deleted', { setlistId: req.params.setlistId });

    res.json({ message: 'Setlist deleted' });
  } catch (error) {
    console.error('Delete setlist error:', error);
    res.status(500).json({ error: 'Failed to delete setlist' });
  }
});

// Add a song to a setlist
router.post('/:setlistId/songs', authenticate, async (req, res) => {
  try {
    const { songId } = req.body;

    if (!songId) {
      return res.status(400).json({ error: 'songId is required' });
    }

    // Get current max position
    const maxPosition = await prisma.setlistSong.aggregate({
      where: { setlistId: req.params.setlistId },
      _max: { position: true }
    });

    const newPosition = (maxPosition._max.position ?? -1) + 1;

    const setlistSong = await prisma.setlistSong.create({
      data: {
        setlistId: req.params.setlistId,
        songId,
        position: newPosition,
        type: 'SONG'
      },
      include: {
        song: true
      }
    });

    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:songAdded', {
      setlistId: req.params.setlistId,
      setlistSong
    });

    res.status(201).json(setlistSong);
  } catch (error) {
    console.error('Add song to setlist error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Song already in setlist' });
    }
    res.status(500).json({ error: 'Failed to add song to setlist' });
  }
});

// Add an MC break to a setlist
router.post('/:setlistId/mc', authenticate, async (req, res) => {
  try {
    const { duration = 60, label = 'MC' } = req.body;

    // Get current max position
    const maxPosition = await prisma.setlistSong.aggregate({
      where: { setlistId: req.params.setlistId },
      _max: { position: true }
    });

    const newPosition = (maxPosition._max.position ?? -1) + 1;

    const setlistItem = await prisma.setlistSong.create({
      data: {
        setlistId: req.params.setlistId,
        position: newPosition,
        type: 'MC',
        duration,
        label
      }
    });

    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:itemAdded', {
      setlistId: req.params.setlistId,
      setlistItem
    });

    res.status(201).json(setlistItem);
  } catch (error) {
    console.error('Add MC to setlist error:', error);
    res.status(500).json({ error: 'Failed to add MC section' });
  }
});

// Reorder items in a setlist
router.put('/:setlistId/reorder', authenticate, async (req, res) => {
  try {
    const { itemIds } = req.body;

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds array is required' });
    }

    // Update positions in a transaction
    await prisma.$transaction(
      itemIds.map((itemId, index) =>
        prisma.setlistSong.update({
          where: { id: itemId },
          data: { position: index }
        })
      )
    );

    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId },
      include: {
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:reordered', setlist);

    res.json(setlist);
  } catch (error) {
    console.error('Reorder setlist error:', error);
    res.status(500).json({ error: 'Failed to reorder setlist' });
  }
});

// Remove a song from a setlist (legacy - by songId)
router.delete('/:setlistId/songs/:songId', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    await prisma.setlistSong.deleteMany({
      where: {
        setlistId: req.params.setlistId,
        songId: req.params.songId
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:songRemoved', {
      setlistId: req.params.setlistId,
      songId: req.params.songId
    });

    res.json({ message: 'Song removed from setlist' });
  } catch (error) {
    console.error('Remove song from setlist error:', error);
    res.status(500).json({ error: 'Failed to remove song from setlist' });
  }
});

// Remove an item from a setlist (by item ID - works for songs and MC)
router.delete('/:setlistId/items/:itemId', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    await prisma.setlistSong.delete({
      where: { id: req.params.itemId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:itemRemoved', {
      setlistId: req.params.setlistId,
      itemId: req.params.itemId
    });

    res.json({ message: 'Item removed from setlist' });
  } catch (error) {
    console.error('Remove item from setlist error:', error);
    res.status(500).json({ error: 'Failed to remove item from setlist' });
  }
});

export default router;
