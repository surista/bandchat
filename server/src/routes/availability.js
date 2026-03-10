import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get availability for a workspace (all members) for a date range
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      workspaceId: req.params.workspaceId
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const availability = await prisma.memberAvailability.findMany({
      where,
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: [
        { date: 'asc' },
        { user: { displayName: 'asc' } }
      ]
    });

    res.json(availability);
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// Get my availability for a workspace
router.get('/workspace/:workspaceId/me', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const availability = await prisma.memberAvailability.findMany({
      where,
      orderBy: { date: 'asc' }
    });

    res.json(availability);
  } catch (error) {
    console.error('Get my availability error:', error);
    res.status(500).json({ error: 'Failed to get availability' });
  }
});

// Set availability for a specific date (create or update)
router.put('/workspace/:workspaceId/date/:date', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { status, note } = req.body;
    const date = new Date(req.params.date);

    if (!['AVAILABLE', 'UNAVAILABLE', 'MAYBE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (note && note.length > 500) return res.status(400).json({ error: 'Note too long' });

    const availability = await prisma.memberAvailability.upsert({
      where: {
        userId_workspaceId_date: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId,
          date
        }
      },
      update: {
        status,
        note: note || null
      },
      create: {
        userId: req.user.id,
        workspaceId: req.params.workspaceId,
        date,
        status,
        note: note || null
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('availability:updated', availability);

    res.json(availability);
  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({ error: 'Failed to set availability' });
  }
});

// Bulk set availability for multiple dates
router.put('/workspace/:workspaceId/bulk', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { dates, status, note } = req.body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'Dates array is required' });
    }

    if (dates.length > 365) return res.status(400).json({ error: 'Maximum 365 dates allowed' });

    if (!['AVAILABLE', 'UNAVAILABLE', 'MAYBE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (note && note.length > 500) return res.status(400).json({ error: 'Note too long' });

    const results = await Promise.all(
      dates.map(dateStr => {
        const date = new Date(dateStr);
        return prisma.memberAvailability.upsert({
          where: {
            userId_workspaceId_date: {
              userId: req.user.id,
              workspaceId: req.params.workspaceId,
              date
            }
          },
          update: {
            status,
            note: note || null
          },
          create: {
            userId: req.user.id,
            workspaceId: req.params.workspaceId,
            date,
            status,
            note: note || null
          },
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true }
            }
          }
        });
      })
    );

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('availability:bulkUpdated', results);

    res.json(results);
  } catch (error) {
    console.error('Bulk set availability error:', error);
    res.status(500).json({ error: 'Failed to set availability' });
  }
});

// Clear availability for a specific date
router.delete('/workspace/:workspaceId/date/:date', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const date = new Date(req.params.date);

    await prisma.memberAvailability.deleteMany({
      where: {
        userId: req.user.id,
        workspaceId: req.params.workspaceId,
        date
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('availability:cleared', {
      userId: req.user.id,
      date: date.toISOString()
    });

    res.json({ message: 'Availability cleared' });
  } catch (error) {
    console.error('Clear availability error:', error);
    res.status(500).json({ error: 'Failed to clear availability' });
  }
});

// Get availability summary for a specific date (for gig planning)
router.get('/workspace/:workspaceId/summary/:date', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const date = new Date(req.params.date);

    // Get all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Get availability for this date
    const availability = await prisma.memberAvailability.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        date
      }
    });

    // Create a map of userId -> status
    const availabilityMap = {};
    availability.forEach(a => {
      availabilityMap[a.userId] = { status: a.status, note: a.note };
    });

    // Build summary
    const summary = {
      date: date.toISOString(),
      total: members.length,
      available: 0,
      unavailable: 0,
      maybe: 0,
      unknown: 0,
      members: members.map(m => {
        const avail = availabilityMap[m.userId];
        return {
          user: m.user,
          role: m.role,
          status: avail?.status || 'UNKNOWN',
          note: avail?.note || null
        };
      })
    };

    // Count statuses
    summary.members.forEach(m => {
      switch (m.status) {
        case 'AVAILABLE': summary.available++; break;
        case 'UNAVAILABLE': summary.unavailable++; break;
        case 'MAYBE': summary.maybe++; break;
        default: summary.unknown++; break;
      }
    });

    res.json(summary);
  } catch (error) {
    console.error('Get availability summary error:', error);
    res.status(500).json({ error: 'Failed to get availability summary' });
  }
});

export default router;
