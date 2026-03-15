import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all stage plots for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const stagePlots = await prisma.stagePlot.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        gig: {
          select: { id: true, title: true, date: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(stagePlots);
  } catch (error) {
    console.error('Error fetching stage plots:', error);
    res.status(500).json({ error: 'Failed to fetch stage plots' });
  }
});

// Get a single stage plot
router.get('/:id', authenticate, async (req, res) => {
  try {
    const stagePlot = await prisma.stagePlot.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        gig: {
          select: { id: true, title: true, date: true }
        }
      }
    });

    if (!stagePlot) {
      return res.status(404).json({ error: 'Stage plot not found' });
    }

    // Verify workspace membership
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: stagePlot.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(stagePlot);
  } catch (error) {
    console.error('Error fetching stage plot:', error);
    res.status(500).json({ error: 'Failed to fetch stage plot' });
  }
});

// Create a stage plot
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, data, gigId } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const stagePlot = await prisma.stagePlot.create({
      data: {
        title: title.trim(),
        data: data || { items: [], stageWidth: 900, stageHeight: 500, theme: 'default' },
        workspaceId: req.params.workspaceId,
        gigId: gigId || null,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        gig: {
          select: { id: true, title: true, date: true }
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${req.params.workspaceId}`).emit('stagePlot:created', stagePlot);
    }

    res.status(201).json(stagePlot);
  } catch (error) {
    console.error('Error creating stage plot:', error);
    res.status(500).json({ error: 'Failed to create stage plot' });
  }
});

// Update a stage plot
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.stagePlot.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Stage plot not found' });
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
      return res.status(403).json({ error: 'Only the creator or an admin can update this stage plot' });
    }

    const { title, data, gigId } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (data !== undefined) updateData.data = data;
    if (gigId !== undefined) updateData.gigId = gigId || null;

    const stagePlot = await prisma.stagePlot.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        gig: {
          select: { id: true, title: true, date: true }
        }
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${existing.workspaceId}`).emit('stagePlot:updated', stagePlot);
    }

    res.json(stagePlot);
  } catch (error) {
    console.error('Error updating stage plot:', error);
    res.status(500).json({ error: 'Failed to update stage plot' });
  }
});

// Delete a stage plot
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.stagePlot.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Stage plot not found' });
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
      return res.status(403).json({ error: 'Only the creator or an admin can delete this stage plot' });
    }

    await prisma.stagePlot.delete({
      where: { id: req.params.id }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${existing.workspaceId}`).emit('stagePlot:deleted', { id: req.params.id });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting stage plot:', error);
    res.status(500).json({ error: 'Failed to delete stage plot' });
  }
});

// Duplicate a stage plot
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const existing = await prisma.stagePlot.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Stage plot not found' });
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

    const stagePlot = await prisma.stagePlot.create({
      data: {
        title: `${existing.title} (copy)`,
        data: existing.data,
        workspaceId: existing.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        gig: {
          select: { id: true, title: true, date: true }
        }
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${existing.workspaceId}`).emit('stagePlot:created', stagePlot);
    }

    res.status(201).json(stagePlot);
  } catch (error) {
    console.error('Error duplicating stage plot:', error);
    res.status(500).json({ error: 'Failed to duplicate stage plot' });
  }
});

export default router;
