import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all band members for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const members = await prisma.bandMember.findMany({
      where: { workspaceId: req.params.workspaceId },
      orderBy: [
        { endDate: 'asc' }, // Current members (null endDate) first
        { startDate: 'asc' }
      ]
    });

    // Sort: current members first (endDate is null), then former members
    const currentMembers = members.filter(m => !m.endDate);
    const formerMembers = members.filter(m => m.endDate);

    res.json({
      current: currentMembers,
      former: formerMembers,
      all: [...currentMembers, ...formerMembers]
    });
  } catch (error) {
    console.error('Get band members error:', error);
    res.status(500).json({ error: 'Failed to get band members' });
  }
});

// Create a band member (admin only)
router.post('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { name, instrument, startDate, endDate, imageUrl, notes } = req.body;

    if (!name || !instrument || !startDate) {
      return res.status(400).json({ error: 'Name, instrument, and start date are required' });
    }

    const member = await prisma.bandMember.create({
      data: {
        name,
        instrument,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        imageUrl,
        notes,
        workspaceId: req.params.workspaceId
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
      where: { id: req.params.memberId }
    });

    if (!member) {
      return res.status(404).json({ error: 'Band member not found' });
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
    const { name, instrument, startDate, endDate, imageUrl, notes } = req.body;

    // Get the member to find its workspace
    const existing = await prisma.bandMember.findUnique({
      where: { id: req.params.memberId }
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

    const member = await prisma.bandMember.update({
      where: { id: req.params.memberId },
      data: {
        ...(name && { name }),
        ...(instrument && { instrument }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(notes !== undefined && { notes })
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
