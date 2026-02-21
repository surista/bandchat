import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all band members for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const members = await prisma.bandMember.findMany({
      where: { workspaceId: req.params.workspaceId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        notes: true,
        isGuest: true,
        linkedUserId: true,
        workspaceId: true,
        createdAt: true,
        stints: {
          orderBy: { startDate: 'asc' }
        },
        linkedUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            email: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Separate guests from regular members
    const guests = members.filter(m => m.isGuest);
    const regularMembers = members.filter(m => !m.isGuest);

    // A member is "current" if they have at least one stint with no endDate (excludes guests)
    const currentMembers = regularMembers.filter(m => m.stints.some(s => !s.endDate));
    const formerMembers = regularMembers.filter(m => m.stints.length > 0 && m.stints.every(s => s.endDate));

    res.json({
      current: currentMembers,
      former: formerMembers,
      guests: guests,
      all: members
    });
  } catch (error) {
    console.error('Get band members error:', error);
    res.status(500).json({ error: 'Failed to get band members' });
  }
});

// Create a band member (admin only)
router.post('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { name, imageUrl, notes, isGuest, stints, linkedUserId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Guests don't need stints, regular members do
    if (!isGuest && (!stints || stints.length === 0)) {
      return res.status(400).json({ error: 'At least one instrument stint is required' });
    }

    // Validate stints if provided
    const validStints = stints || [];
    for (const stint of validStints) {
      const instruments = stint.instruments || (stint.instrument ? [stint.instrument] : []);
      if (instruments.length === 0 || !stint.startDate) {
        return res.status(400).json({ error: 'Each stint requires at least one instrument and start date' });
      }
    }

    // Validate linkedUserId if provided
    if (linkedUserId) {
      const linkedMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: linkedUserId,
            workspaceId: req.params.workspaceId
          }
        }
      });
      if (!linkedMember) {
        return res.status(400).json({ error: 'Linked user is not a member of this workspace' });
      }
    }

    const member = await prisma.bandMember.create({
      data: {
        name,
        imageUrl,
        notes,
        isGuest: isGuest || false,
        linkedUserId: linkedUserId || null,
        workspaceId: req.params.workspaceId,
        ...(validStints.length > 0 && {
          stints: {
            create: validStints.map(s => ({
              instruments: s.instruments || (s.instrument ? [s.instrument] : []),
              startDate: new Date(s.startDate),
              endDate: s.endDate ? new Date(s.endDate) : null
            }))
          }
        })
      },
      include: {
        stints: {
          orderBy: { startDate: 'asc' }
        },
        linkedUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            email: true
          }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('bandMember:created', member);

    res.status(201).json(member);
  } catch (error) {
    console.error('Create band member error:', error);
    res.status(500).json({ error: 'Failed to create band member' });
  }
});

// Get a single band member
router.get('/:memberId', authenticate, async (req, res) => {
  try {
    const member = await prisma.bandMember.findUnique({
      where: { id: req.params.memberId },
      include: {
        stints: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    if (!member) {
      return res.status(404).json({ error: 'Band member not found' });
    }

    // Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: member.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(member);
  } catch (error) {
    console.error('Get band member error:', error);
    res.status(500).json({ error: 'Failed to get band member' });
  }
});

// Update a band member (admin only)
router.put('/:memberId', authenticate, async (req, res) => {
  try {
    const { name, imageUrl, notes, isGuest, stints, linkedUserId } = req.body;

    // Get the member to find its workspace
    const existing = await prisma.bandMember.findUnique({
      where: { id: req.params.memberId },
      include: { stints: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Band member not found' });
    }

    // Check if user is admin of this workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate linkedUserId if provided
    if (linkedUserId !== undefined && linkedUserId !== null) {
      const linkedMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: linkedUserId,
            workspaceId: existing.workspaceId
          }
        }
      });
      if (!linkedMember) {
        return res.status(400).json({ error: 'Linked user is not a member of this workspace' });
      }
    }

    // Build update operations
    const updateData = {
      ...(name && { name }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(notes !== undefined && { notes }),
      ...(isGuest !== undefined && { isGuest }),
      ...(linkedUserId !== undefined && { linkedUserId: linkedUserId || null })
    };

    // Determine if member is/will be a guest
    const willBeGuest = isGuest !== undefined ? isGuest : existing.isGuest;

    // If stints are provided, replace all stints
    if (stints !== undefined) {
      // Guests can have empty stints, regular members cannot
      if (!willBeGuest && (!stints || stints.length === 0)) {
        return res.status(400).json({ error: 'At least one instrument stint is required' });
      }

      // Validate stints if provided
      const validStints = stints || [];
      for (const stint of validStints) {
        const instruments = stint.instruments || (stint.instrument ? [stint.instrument] : []);
        if (instruments.length === 0 || !stint.startDate) {
          return res.status(400).json({ error: 'Each stint requires at least one instrument and start date' });
        }
      }

      // Delete existing stints and create new ones in a transaction
      await prisma.$transaction([
        prisma.instrumentStint.deleteMany({
          where: { bandMemberId: req.params.memberId }
        }),
        prisma.bandMember.update({
          where: { id: req.params.memberId },
          data: {
            ...updateData,
            ...(validStints.length > 0 && {
              stints: {
                create: validStints.map(s => ({
                  instruments: s.instruments || (s.instrument ? [s.instrument] : []),
                  startDate: new Date(s.startDate),
                  endDate: s.endDate ? new Date(s.endDate) : null
                }))
              }
            })
          }
        })
      ]);
    } else {
      // Just update basic info
      await prisma.bandMember.update({
        where: { id: req.params.memberId },
        data: updateData
      });
    }

    // Fetch updated member with stints and linkedUser
    const member = await prisma.bandMember.findUnique({
      where: { id: req.params.memberId },
      include: {
        stints: {
          orderBy: { startDate: 'asc' }
        },
        linkedUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            email: true
          }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${member.workspaceId}`).emit('bandMember:updated', member);

    res.json(member);
  } catch (error) {
    console.error('Update band member error:', error);
    res.status(500).json({ error: 'Failed to update band member' });
  }
});

// Delete a band member (admin only)
router.delete('/:memberId', authenticate, async (req, res) => {
  try {
    const member = await prisma.bandMember.findUnique({
      where: { id: req.params.memberId }
    });

    if (!member) {
      return res.status(404).json({ error: 'Band member not found' });
    }

    // Check if user is admin of this workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: member.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.bandMember.delete({
      where: { id: req.params.memberId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${member.workspaceId}`).emit('bandMember:deleted', { memberId: req.params.memberId });

    res.json({ message: 'Band member deleted' });
  } catch (error) {
    console.error('Delete band member error:', error);
    res.status(500).json({ error: 'Failed to delete band member' });
  }
});

export default router;
