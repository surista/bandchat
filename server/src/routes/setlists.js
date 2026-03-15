import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';

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
        performers: {
          include: {
            bandMember: {
              include: { stints: { orderBy: { startDate: 'asc' } } }
            }
          }
        },
        _count: {
          select: { gigs: true }
        }
      },
      orderBy: [
        { performedAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' }
      ],
      take: 100
    });

    // Transform performers to just the bandMember objects
    const transformed = setlists.map(s => ({
      ...s,
      performers: s.performers.map(p => p.bandMember)
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Get setlists error:', error);
    res.status(500).json({ error: 'Failed to get setlists' });
  }
});

// Create a setlist
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, description, useShortNames, performedAt, venue, startTime } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check plan setlist limit
    const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (limits.maxSetlists !== Infinity) {
      const setlistCount = await prisma.setlist.count({ where: { workspaceId: req.params.workspaceId } });
      if (setlistCount >= limits.maxSetlists) {
        return res.status(403).json({ error: `Free plan allows up to ${limits.maxSetlists} setlists. Upgrade to Pro for unlimited.`, upgrade: true });
      }
    }

    // Input length validation
    if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (description && description.length > 5000) return res.status(400).json({ error: 'Description must be 5,000 characters or less' });

    const setlist = await prisma.setlist.create({
      data: {
        name,
        description,
        useShortNames: useShortNames || false,
        performedAt: performedAt ? new Date(performedAt) : null,
        venue: venue || null,
        startTime: startTime || null,
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
        performers: {
          include: {
            bandMember: {
              include: { stints: { orderBy: { startDate: 'asc' } } }
            }
          }
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

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Transform performers
    res.json({
      ...setlist,
      performers: setlist.performers.map(p => p.bandMember)
    });
  } catch (error) {
    console.error('Get setlist error:', error);
    res.status(500).json({ error: 'Failed to get setlist' });
  }
});

// Update a setlist
router.put('/:setlistId', authenticate, async (req, res) => {
  try {
    const { name, description, useShortNames, performedAt, venue, startTime } = req.body;

    const existing = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    if (existing.createdById !== req.user.id && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can update this setlist' });
    }

    // Input length validation
    if (name && name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (description && description.length > 5000) return res.status(400).json({ error: 'Description must be 5,000 characters or less' });

    const setlist = await prisma.setlist.update({
      where: { id: req.params.setlistId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(useShortNames !== undefined && { useShortNames }),
        ...(performedAt !== undefined && { performedAt: performedAt ? new Date(performedAt) : null }),
        ...(venue !== undefined && { venue }),
        ...(startTime !== undefined && { startTime: startTime || null })
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

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (setlist.createdById !== req.user.id && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can delete setlists' });
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

// Duplicate a setlist
router.post('/:setlistId/duplicate', authenticate, async (req, res) => {
  try {
    const { name } = req.body;

    // Get source setlist with all items
    const source = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId },
      include: {
        songs: {
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: source.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Check plan setlist limit
    const workspace = await prisma.workspace.findUnique({ where: { id: source.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (limits.maxSetlists !== Infinity) {
      const setlistCount = await prisma.setlist.count({ where: { workspaceId: source.workspaceId } });
      if (setlistCount >= limits.maxSetlists) {
        return res.status(403).json({ error: `Free plan allows up to ${limits.maxSetlists} setlists. Upgrade to Pro for unlimited.`, upgrade: true });
      }
    }

    // Create new setlist with copied data
    const newSetlist = await prisma.setlist.create({
      data: {
        name: name || `Copy of ${source.name}`,
        description: source.description,
        useShortNames: source.useShortNames,
        startTime: source.startTime,
        workspaceId: source.workspaceId,
        createdById: req.user.id,
        // Copy all setlist items
        songs: {
          create: source.songs.map(item => ({
            songId: item.songId,
            position: item.position,
            type: item.type,
            duration: item.duration,
            label: item.label
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
        },
        _count: {
          select: { gigs: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${source.workspaceId}`).emit('setlist:created', newSetlist);

    res.status(201).json(newSetlist);
  } catch (error) {
    console.error('Duplicate setlist error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A setlist with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to duplicate setlist' });
  }
});

// Add a song to a setlist
router.post('/:setlistId/songs', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({ where: { id: req.params.setlistId } });
    if (!setlist) return res.status(404).json({ error: 'Setlist not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

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
    const setlist = await prisma.setlist.findUnique({ where: { id: req.params.setlistId } });
    if (!setlist) return res.status(404).json({ error: 'Setlist not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

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

// Add a Set Break/divider to a setlist
router.post('/:setlistId/set-break', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({ where: { id: req.params.setlistId } });
    if (!setlist) return res.status(404).json({ error: 'Setlist not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const { label = 'Set Break', duration = 900 } = req.body;

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
        type: 'SET_BREAK',
        label,
        duration
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:itemAdded', {
      setlistId: req.params.setlistId,
      setlistItem
    });

    res.status(201).json(setlistItem);
  } catch (error) {
    console.error('Add Set Break to setlist error:', error);
    res.status(500).json({ error: 'Failed to add Set Break' });
  }
});

// Reorder items in a setlist
router.put('/:setlistId/reorder', authenticate, async (req, res) => {
  try {
    const { itemIds } = req.body;

    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds array is required' });
    }

    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId },
      include: {
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Validate all itemIds belong to this setlist
    const validIds = new Set(setlist.songs.map(s => s.id));
    const invalidIds = itemIds.filter(id => !validIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: 'Some item IDs do not belong to this setlist' });
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

    // Re-fetch with updated positions
    const updatedSetlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId },
      include: {
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${updatedSetlist.workspaceId}`).emit('setlist:reordered', updatedSetlist);

    res.json(updatedSetlist);
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

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
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
    const { name, songs, useShortNames, performedAt, venue, startTime } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Setlist name is required' });
    }

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    // Check plan setlist limit
    const wsForPlan = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const planLimits = getPlanLimits(wsForPlan);
    if (planLimits.maxSetlists !== Infinity) {
      const setlistCount = await prisma.setlist.count({ where: { workspaceId: req.params.workspaceId } });
      if (setlistCount >= planLimits.maxSetlists) {
        return res.status(403).json({ error: `Free plan allows up to ${planLimits.maxSetlists} setlists. Upgrade to Pro for unlimited.`, upgrade: true });
      }
    }

    // Get all songs in the workspace for matching
    const workspaceSongs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId }
    });

    const results = {
      matched: [],
      notFound: []
    };

    // Match songs by title, shortName, or partial match
    const matchedSongIds = [];
    for (const songInput of songs) {
      const title = songInput.title?.toLowerCase().trim();
      const artist = songInput.artist?.toLowerCase().trim();

      if (!title) continue;

      // Find matching song - priority order:
      // 1. Exact title+artist match
      // 2. Exact title match
      // 3. Exact shortName match
      // 4. Partial title match
      let match = workspaceSongs.find(s => {
        const sTitle = s.title.toLowerCase().trim();
        const sArtist = s.artist?.toLowerCase().trim();
        if (artist && sArtist) {
          return sTitle === title && sArtist === artist;
        }
        return false;
      });

      if (!match) {
        match = workspaceSongs.find(s => s.title.toLowerCase().trim() === title);
      }

      // Try shortName match
      if (!match) {
        match = workspaceSongs.find(s => {
          const sShortName = s.shortName?.toLowerCase().trim();
          return sShortName && sShortName === title;
        });
      }

      // Try partial match if no exact match
      if (!match) {
        match = workspaceSongs.find(s => {
          const sTitle = s.title.toLowerCase().trim();
          const sShortName = s.shortName?.toLowerCase().trim();
          return sTitle.includes(title) || title.includes(sTitle) ||
                 (sShortName && (sShortName.includes(title) || title.includes(sShortName)));
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
        performedAt: performedAt ? new Date(performedAt) : null,
        venue: venue || null,
        startTime: startTime || null,
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

// Bulk import multiple sets from text with "Set 1", "Set 2" markers
// Creates ONE setlist with SET_BREAK markers between sets
router.post('/workspace/:workspaceId/import-multiset', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { baseName, sets, gigId, performedAt, venue, startTime } = req.body;

    // sets is an array of { setNumber, songs: [{ title, artist }] }
    if (!sets || !Array.isArray(sets) || sets.length === 0) {
      return res.status(400).json({ error: 'Sets array is required' });
    }

    if (!baseName) {
      return res.status(400).json({ error: 'Base name is required' });
    }

    // Check plan setlist limit
    const wsForPlan2 = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const planLimits2 = getPlanLimits(wsForPlan2);
    if (planLimits2.maxSetlists !== Infinity) {
      const setlistCount = await prisma.setlist.count({ where: { workspaceId: req.params.workspaceId } });
      if (setlistCount >= planLimits2.maxSetlists) {
        return res.status(403).json({ error: `Free plan allows up to ${planLimits2.maxSetlists} setlists. Upgrade to Pro for unlimited.`, upgrade: true });
      }
    }

    // Get all songs in the workspace for matching
    const workspaceSongs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId }
    });

    const allResults = {
      sets: [],
      totalMatched: 0,
      totalNotFound: 0
    };

    // Build all items for the single setlist
    const setlistItems = [];
    let position = 0;

    for (let i = 0; i < sets.length; i++) {
      const setData = sets[i];
      const { setNumber, songs } = setData;

      // Add SET_BREAK marker at the start of each set (including first)
      setlistItems.push({
        songId: null,
        position: position++,
        type: 'SET_BREAK',
        label: `Set ${setNumber}`,
        duration: 900
      });

      const results = {
        setNumber,
        matched: [],
        notFound: []
      };

      // Match songs by title, shortName, or partial match
      for (const songInput of songs) {
        const title = songInput.title?.toLowerCase().trim();
        const artist = songInput.artist?.toLowerCase().trim();

        if (!title) continue;

        // Priority: exact title+artist > exact title > exact shortName > partial match
        let match = workspaceSongs.find(s => {
          const sTitle = s.title.toLowerCase().trim();
          const sArtist = s.artist?.toLowerCase().trim();
          if (artist && sArtist) {
            return sTitle === title && sArtist === artist;
          }
          return false;
        });

        if (!match) {
          match = workspaceSongs.find(s => s.title.toLowerCase().trim() === title);
        }

        // Try shortName match
        if (!match) {
          match = workspaceSongs.find(s => {
            const sShortName = s.shortName?.toLowerCase().trim();
            return sShortName && sShortName === title;
          });
        }

        // Try partial match
        if (!match) {
          match = workspaceSongs.find(s => {
            const sTitle = s.title.toLowerCase().trim();
            const sShortName = s.shortName?.toLowerCase().trim();
            return sTitle.includes(title) || title.includes(sTitle) ||
                   (sShortName && (sShortName.includes(title) || title.includes(sShortName)));
          });
        }

        if (match) {
          // Check if this song is already in the setlist (avoid duplicates within set)
          const alreadyAdded = setlistItems.some(item => item.songId === match.id);
          if (!alreadyAdded) {
            setlistItems.push({
              songId: match.id,
              position: position++,
              type: 'SONG'
            });
            results.matched.push({ input: songInput, song: match });
          }
        } else {
          results.notFound.push(songInput);
        }
      }

      allResults.totalMatched += results.matched.length;
      allResults.totalNotFound += results.notFound.length;
      allResults.sets.push(results);
    }

    // Create the single setlist with all items
    const setlist = await prisma.setlist.create({
      data: {
        name: baseName,
        performedAt: performedAt ? new Date(performedAt) : null,
        venue: venue || null,
        startTime: startTime || null,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id,
        songs: {
          create: setlistItems
        }
      },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        songs: { include: { song: true }, orderBy: { position: 'asc' } }
      }
    });

    // If gigId provided, link setlist to gig
    if (gigId) {
      await prisma.gigSetlist.create({
        data: {
          gigId,
          setlistId: setlist.id,
          setNumber: 1
        }
      });
    }

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('setlist:created', setlist);

    res.status(201).json({
      setlist,
      results: allResults
    });
  } catch (error) {
    console.error('Import multi-set error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A setlist with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to import setlist' });
  }
});

// Update a setlist item (label, duration)
router.put('/:setlistId/items/:itemId', authenticate, async (req, res) => {
  try {
    const { label, duration } = req.body;

    // Verify item belongs to this setlist
    const item = await prisma.setlistSong.findFirst({
      where: {
        id: req.params.itemId,
        setlistId: req.params.setlistId
      },
      include: { setlist: true }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found in this setlist' });
    }

    // Verify user is a workspace member
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: item.setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.setlistSong.update({
      where: { id: req.params.itemId },
      data: {
        ...(label !== undefined && { label }),
        ...(duration !== undefined && { duration })
      },
      include: { song: true }
    });

    const io = req.app.get('io');
    io.to(`workspace:${item.setlist.workspaceId}`).emit('setlist:itemUpdated', {
      setlistId: req.params.setlistId,
      item: updated
    });

    res.json(updated);
  } catch (error) {
    console.error('Update setlist item error:', error);
    res.status(500).json({ error: 'Failed to update setlist item' });
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

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Use deleteMany with both id and setlistId to verify item belongs to this setlist
    const result = await prisma.setlistSong.deleteMany({
      where: {
        id: req.params.itemId,
        setlistId: req.params.setlistId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Item not found in this setlist' });
    }

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

// Get performers for a setlist
router.get('/:setlistId/performers', authenticate, async (req, res) => {
  try {
    const setlist = await prisma.setlist.findUnique({ where: { id: req.params.setlistId } });
    if (!setlist) return res.status(404).json({ error: 'Setlist not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const performers = await prisma.setlistPerformer.findMany({
      where: { setlistId: req.params.setlistId },
      include: {
        bandMember: {
          include: { stints: { orderBy: { startDate: 'asc' } } }
        }
      }
    });

    res.json(performers.map(p => p.bandMember));
  } catch (error) {
    console.error('Get setlist performers error:', error);
    res.status(500).json({ error: 'Failed to get performers' });
  }
});

// Set performers for a setlist (replaces all)
router.put('/:setlistId/performers', authenticate, async (req, res) => {
  try {
    const { bandMemberIds } = req.body;

    if (!Array.isArray(bandMemberIds)) {
      return res.status(400).json({ error: 'bandMemberIds must be an array' });
    }

    const setlist = await prisma.setlist.findUnique({
      where: { id: req.params.setlistId }
    });

    if (!setlist) {
      return res.status(404).json({ error: 'Setlist not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: setlist.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Delete existing performers and create new ones
    await prisma.$transaction([
      prisma.setlistPerformer.deleteMany({
        where: { setlistId: req.params.setlistId }
      }),
      ...bandMemberIds.map(bandMemberId =>
        prisma.setlistPerformer.create({
          data: {
            setlistId: req.params.setlistId,
            bandMemberId
          }
        })
      )
    ]);

    // Fetch updated performers
    const performers = await prisma.setlistPerformer.findMany({
      where: { setlistId: req.params.setlistId },
      include: {
        bandMember: {
          include: { stints: { orderBy: { startDate: 'asc' } } }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${setlist.workspaceId}`).emit('setlist:performersUpdated', {
      setlistId: req.params.setlistId,
      performers: performers.map(p => p.bandMember)
    });

    res.json(performers.map(p => p.bandMember));
  } catch (error) {
    console.error('Update setlist performers error:', error);
    res.status(500).json({ error: 'Failed to update performers' });
  }
});

export default router;
