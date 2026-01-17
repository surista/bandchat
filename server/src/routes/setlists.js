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
    const { name, description, useShortNames } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const setlist = await prisma.setlist.create({
      data: {
        name,
        description,
        useShortNames: useShortNames || false,
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
    const { name, description, useShortNames } = req.body;

    const setlist = await prisma.setlist.update({
      where: { id: req.params.setlistId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(useShortNames !== undefined && { useShortNames })
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

// Bulk import a setlist from text
router.post('/workspace/:workspaceId/import', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, songs, useShortNames } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Setlist name is required' });
    }

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    // Get all songs in the workspace for matching
    const workspaceSongs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId }
    });

    const results = {
      matched: [],
      notFound: []
    };

    // Match songs by title (and optionally artist)
    const matchedSongIds = [];
    for (const songInput of songs) {
      const title = songInput.title?.toLowerCase().trim();
      const artist = songInput.artist?.toLowerCase().trim();

      if (!title) continue;

      // Find matching song - prefer exact title+artist match, fall back to title only
      let match = workspaceSongs.find(s => {
        const sTitle = s.title.toLowerCase().trim();
        const sArtist = s.artist?.toLowerCase().trim();

        if (artist && sArtist) {
          return sTitle === title && sArtist === artist;
        }
        return sTitle === title;
      });

      // Try partial match if no exact match
      if (!match) {
        match = workspaceSongs.find(s => {
          const sTitle = s.title.toLowerCase().trim();
          return sTitle.includes(title) || title.includes(sTitle);
        });
      }

      if (match) {
        if (!matchedSongIds.includes(match.id)) {
          matchedSongIds.push(match.id);
          results.matched.push({ input: songInput, song: match });
        }
      } else {
        results.notFound.push(songInput);
      }
    }

    if (matchedSongIds.length === 0) {
      return res.status(400).json({
        error: 'No matching songs found in your song library',
        notFound: results.notFound
      });
    }

    // Create the setlist
    const setlist = await prisma.setlist.create({
      data: {
        name,
        useShortNames: useShortNames || false,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id,
        songs: {
          create: matchedSongIds.map((songId, index) => ({
            songId,
            position: index,
            type: 'SONG'
          }))
        }
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

    res.status(201).json({
      setlist,
      results
    });
  } catch (error) {
    console.error('Import setlist error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A setlist with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to import setlist' });
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
