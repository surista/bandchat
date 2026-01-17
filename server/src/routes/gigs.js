import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all gigs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { type, status, from, to } = req.query;

    const where = {
      workspaceId: req.params.workspaceId,
      ...(type && { type }),
      ...(status && { status }),
      ...(from || to) && {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) })
        }
      }
    };

    const gigs = await prisma.gig.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { songsPlayed: true }
        }
      },
      orderBy: { date: 'asc' }
    });

    res.json(gigs);
  } catch (error) {
    console.error('Get gigs error:', error);
    res.status(500).json({ error: 'Failed to get gigs' });
  }
});

// Get gig statistics
router.get('/workspace/:workspaceId/stats', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Total gigs completed
    const totalGigs = await prisma.gig.count({
      where: { workspaceId, status: 'COMPLETED', type: 'GIG' }
    });

    // Total rehearsals
    const totalRehearsals = await prisma.gig.count({
      where: { workspaceId, status: 'COMPLETED', type: 'REHEARSAL' }
    });

    // Total revenue
    const revenue = await prisma.gig.aggregate({
      where: { workspaceId, status: 'COMPLETED', pay: { not: null } },
      _sum: { pay: true }
    });

    // Most played songs
    const mostPlayed = await prisma.gigSong.groupBy({
      by: ['songId'],
      where: {
        gig: { workspaceId, status: 'COMPLETED' }
      },
      _count: { songId: true },
      orderBy: { _count: { songId: 'desc' } },
      take: 10
    });

    // Get song details for most played
    const songIds = mostPlayed.map(s => s.songId);
    const songs = await prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, artist: true }
    });

    const mostPlayedWithDetails = mostPlayed.map(mp => ({
      ...songs.find(s => s.id === mp.songId),
      playCount: mp._count.songId
    }));

    // Songs never played
    const playedSongIds = await prisma.gigSong.findMany({
      where: { gig: { workspaceId } },
      select: { songId: true },
      distinct: ['songId']
    });

    const neverPlayed = await prisma.song.count({
      where: {
        workspaceId,
        id: { notIn: playedSongIds.map(s => s.songId) }
      }
    });

    // Upcoming gigs
    const upcomingGigs = await prisma.gig.count({
      where: {
        workspaceId,
        status: 'SCHEDULED',
        date: { gte: new Date() }
      }
    });

    res.json({
      totalGigs,
      totalRehearsals,
      totalRevenue: revenue._sum.pay || 0,
      mostPlayedSongs: mostPlayedWithDetails,
      songsNeverPlayed: neverPlayed,
      upcomingGigs
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Create a gig
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, type, date, endDate, venue, address, notes, pay, setlistId } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    const gig = await prisma.gig.create({
      data: {
        title,
        type: type || 'GIG',
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        venue,
        address,
        notes,
        pay,
        setlistId,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('gig:created', gig);

    res.status(201).json(gig);
  } catch (error) {
    console.error('Create gig error:', error);
    res.status(500).json({ error: 'Failed to create gig' });
  }
});

// Get a single gig
router.get('/:gigId', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
        },
        songsPlayed: {
          include: {
            song: true
          }
        }
      }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    res.json(gig);
  } catch (error) {
    console.error('Get gig error:', error);
    res.status(500).json({ error: 'Failed to get gig' });
  }
});

// Update a gig
router.put('/:gigId', authenticate, async (req, res) => {
  try {
    const { title, type, date, endDate, venue, address, notes, pay, status, setlistId } = req.body;

    const gig = await prisma.gig.update({
      where: { id: req.params.gigId },
      data: {
        ...(title && { title }),
        ...(type && { type }),
        ...(date && { date: new Date(date) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(venue !== undefined && { venue }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...(pay !== undefined && { pay }),
        ...(status && { status }),
        ...(setlistId !== undefined && { setlistId })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:updated', gig);

    res.json(gig);
  } catch (error) {
    console.error('Update gig error:', error);
    res.status(500).json({ error: 'Failed to update gig' });
  }
});

// Mark gig as complete with songs played
router.put('/:gigId/complete', authenticate, async (req, res) => {
  try {
    let { songIds } = req.body;

    // Get the gig with its setlist
    const existingGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        setlist: {
          include: {
            songs: {
              where: { type: 'SONG' }, // Only actual songs, not MC sections
              select: { songId: true }
            }
          }
        }
      }
    });

    if (!existingGig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // If no songIds provided but gig has a setlist, use setlist songs
    if ((!songIds || songIds.length === 0) && existingGig.setlist?.songs?.length > 0) {
      songIds = existingGig.setlist.songs.map(s => s.songId).filter(Boolean);
    }

    // Update status to completed
    const gig = await prisma.gig.update({
      where: { id: req.params.gigId },
      data: { status: 'COMPLETED' }
    });

    // Record songs played
    if (songIds && songIds.length > 0) {
      await prisma.gigSong.createMany({
        data: songIds.map(songId => ({
          gigId: req.params.gigId,
          songId
        })),
        skipDuplicates: true
      });
    }

    const updatedGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
        },
        songsPlayed: {
          include: { song: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:completed', updatedGig);

    res.json(updatedGig);
  } catch (error) {
    console.error('Complete gig error:', error);
    res.status(500).json({ error: 'Failed to complete gig' });
  }
});

// Delete a gig
router.delete('/:gigId', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    await prisma.gig.delete({
      where: { id: req.params.gigId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:deleted', { gigId: req.params.gigId });

    res.json({ message: 'Gig deleted' });
  } catch (error) {
    console.error('Delete gig error:', error);
    res.status(500).json({ error: 'Failed to delete gig' });
  }
});

// Add media to a gig
router.post('/:gigId/media', authenticate, async (req, res) => {
  try {
    const { type, url, caption } = req.body;

    if (!type || !url) {
      return res.status(400).json({ error: 'Type and URL are required' });
    }

    // Verify gig exists and user has access
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: { workspace: { include: { members: true } } }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const isMember = gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const media = await prisma.gigMedia.create({
      data: {
        gigId: req.params.gigId,
        type,
        url,
        caption
      }
    });

    res.status(201).json(media);
  } catch (error) {
    console.error('Add gig media error:', error);
    res.status(500).json({ error: 'Failed to add media' });
  }
});

// Delete media from a gig
router.delete('/:gigId/media/:mediaId', authenticate, async (req, res) => {
  try {
    const media = await prisma.gigMedia.findUnique({
      where: { id: req.params.mediaId },
      include: {
        gig: {
          include: { workspace: { include: { members: true } } }
        }
      }
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const isMember = media.gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    await prisma.gigMedia.delete({
      where: { id: req.params.mediaId }
    });

    res.json({ message: 'Media deleted' });
  } catch (error) {
    console.error('Delete gig media error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;
