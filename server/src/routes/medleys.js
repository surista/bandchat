import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all medleys for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const medleys = await prisma.medley.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                duration: true,
                key: true,
                bpm: true
              }
            }
          },
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Calculate total duration for each medley
    const result = medleys.map(medley => ({
      ...medley,
      totalDuration: medley.songs.reduce((sum, ms) => sum + (ms.song.duration || 0), 0),
      songCount: medley.songs.length
    }));

    res.json(result);
  } catch (error) {
    console.error('Get medleys error:', error);
    res.status(500).json({ error: 'Failed to get medleys' });
  }
});

// Create a medley
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, description, songIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!songIds || songIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 songs are required for a medley' });
    }

    const medley = await prisma.medley.create({
      data: {
        name,
        description,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id,
        songs: {
          create: songIds.map((songId, index) => ({
            songId,
            position: index
          }))
        }
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                duration: true,
                key: true,
                bpm: true
              }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('medley:created', medley);

    res.status(201).json(medley);
  } catch (error) {
    console.error('Create medley error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A medley with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create medley' });
  }
});

// Get a single medley
router.get('/:medleyId', authenticate, async (req, res) => {
  try {
    const medley = await prisma.medley.findUnique({
      where: { id: req.params.medleyId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: true
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!medley) {
      return res.status(404).json({ error: 'Medley not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: medley.workspaceId
        }
      }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json({
      ...medley,
      totalDuration: medley.songs.reduce((sum, ms) => sum + (ms.song.duration || 0), 0),
      songCount: medley.songs.length
    });
  } catch (error) {
    console.error('Get medley error:', error);
    res.status(500).json({ error: 'Failed to get medley' });
  }
});

// Update a medley
router.put('/:medleyId', authenticate, async (req, res) => {
  try {
    const { name, description, songIds } = req.body;

    const existing = await prisma.medley.findUnique({
      where: { id: req.params.medleyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Medley not found' });
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
      return res.status(403).json({ error: 'Only the creator or an admin can update medleys' });
    }

    // If songIds provided, update the songs
    if (songIds !== undefined) {
      if (songIds.length < 2) {
        return res.status(400).json({ error: 'At least 2 songs are required for a medley' });
      }

      // Delete existing songs and recreate atomically
      await prisma.$transaction([
        prisma.medleySong.deleteMany({
          where: { medleyId: req.params.medleyId }
        }),
        prisma.medleySong.createMany({
          data: songIds.map((songId, index) => ({
            medleyId: req.params.medleyId,
            songId,
            position: index
          }))
        })
      ]);
    }

    const medley = await prisma.medley.update({
      where: { id: req.params.medleyId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        songs: {
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                duration: true,
                key: true,
                bpm: true
              }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${medley.workspaceId}`).emit('medley:updated', medley);

    res.json(medley);
  } catch (error) {
    console.error('Update medley error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A medley with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update medley' });
  }
});

// Reorder songs in a medley
router.put('/:medleyId/reorder', authenticate, async (req, res) => {
  try {
    const { songIds } = req.body;

    if (!songIds || songIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 songs are required' });
    }

    const medley = await prisma.medley.findUnique({
      where: { id: req.params.medleyId }
    });

    if (!medley) {
      return res.status(404).json({ error: 'Medley not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: medley.workspaceId
        }
      }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Update positions atomically
    await prisma.$transaction(
      songIds.map((songId, i) =>
        prisma.medleySong.updateMany({
          where: {
            medleyId: req.params.medleyId,
            songId
          },
          data: { position: i }
        })
      )
    );

    const updatedMedley = await prisma.medley.findUnique({
      where: { id: req.params.medleyId },
      include: {
        songs: {
          include: {
            song: {
              select: {
                id: true,
                title: true,
                artist: true,
                duration: true
              }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${medley.workspaceId}`).emit('medley:updated', updatedMedley);

    res.json(updatedMedley);
  } catch (error) {
    console.error('Reorder medley error:', error);
    res.status(500).json({ error: 'Failed to reorder medley' });
  }
});

// Delete a medley
router.delete('/:medleyId', authenticate, async (req, res) => {
  try {
    const medley = await prisma.medley.findUnique({
      where: { id: req.params.medleyId }
    });

    if (!medley) {
      return res.status(404).json({ error: 'Medley not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: medley.workspaceId
        }
      }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (medley.createdById !== req.user.id && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can delete medleys' });
    }

    await prisma.medley.delete({
      where: { id: req.params.medleyId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${medley.workspaceId}`).emit('medley:deleted', { medleyId: req.params.medleyId });

    res.json({ message: 'Medley deleted' });
  } catch (error) {
    console.error('Delete medley error:', error);
    res.status(500).json({ error: 'Failed to delete medley' });
  }
});

export default router;
