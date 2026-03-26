import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';

const router = express.Router();

// Middleware to check practice feature access
const requirePracticeFeature = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) return next();
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (!limits.features.practice) {
      return res.status(403).json({ error: 'Practice Tracker is a Pro feature. Upgrade to unlock.', upgrade: true });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Log a practice session
router.post('/workspace/:workspaceId', authenticate, apiLimiter, isWorkspaceMember, requirePracticeFeature, async (req, res) => {
  try {
    const { songId, duration, notes, practicedAt } = req.body;

    if (!songId || !duration) {
      return res.status(400).json({ error: 'songId and duration are required' });
    }

    const dur = parseInt(duration);
    if (isNaN(dur) || dur < 1 || dur > 480) {
      return res.status(400).json({ error: 'Duration must be between 1 and 480 minutes' });
    }

    if (notes && notes.length > 2000) {
      return res.status(400).json({ error: 'Notes must be 2,000 characters or less' });
    }

    // Verify song belongs to workspace
    const song = await prisma.song.findFirst({
      where: { id: songId, workspaceId: req.params.workspaceId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found in this workspace' });
    }

    const session = await prisma.practiceSession.create({
      data: {
        songId,
        userId: req.user.id,
        workspaceId: req.params.workspaceId,
        duration: dur,
        notes: notes || null,
        practicedAt: practicedAt ? new Date(practicedAt) : new Date()
      },
      include: {
        song: {
          select: { id: true, title: true, artist: true }
        }
      }
    });

    res.status(201).json(session);
  } catch (error) {
    console.error('Log practice error:', error);
    res.status(500).json({ error: 'Failed to log practice session' });
  }
});

// Get my practice sessions
router.get('/workspace/:workspaceId/me', authenticate, isWorkspaceMember, requirePracticeFeature, async (req, res) => {
  try {
    const { cursor, limit = 20 } = req.query;
    const take = Math.min(parseInt(limit) || 20, 100);

    const sessions = await prisma.practiceSession.findMany({
      where: {
        userId: req.user.id,
        workspaceId: req.params.workspaceId
      },
      take: take + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1
      }),
      orderBy: { practicedAt: 'desc' },
      include: {
        song: {
          select: { id: true, title: true, artist: true }
        }
      }
    });

    const hasMore = sessions.length > take;
    const items = hasMore ? sessions.slice(0, take) : sessions;

    res.json({
      sessions: items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore
    });
  } catch (error) {
    console.error('Get practice sessions error:', error);
    res.status(500).json({ error: 'Failed to get practice sessions' });
  }
});

// Get practice summary (per-song stats + streak)
router.get('/workspace/:workspaceId/summary', authenticate, isWorkspaceMember, requirePracticeFeature, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const userId = req.user.id;
    const timezone = req.query.timezone || 'UTC';

    // Calculate the offset in milliseconds for the user's timezone
    // We use a reference date to get the timezone offset
    let tzOffsetMs = 0;
    try {
      const now = new Date();
      const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
      tzOffsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
    } catch {
      // Invalid timezone, fall back to UTC (offset stays 0)
    }

    // Per-song aggregation
    const songStats = await prisma.practiceSession.groupBy({
      by: ['songId'],
      where: { userId, workspaceId },
      _sum: { duration: true },
      _max: { practicedAt: true },
      _count: { id: true }
    });

    // Total stats
    const totals = await prisma.practiceSession.aggregate({
      where: { userId, workspaceId },
      _sum: { duration: true },
      _count: { id: true }
    });

    // Calculate streak (consecutive days with practice)
    const recentSessions = await prisma.practiceSession.findMany({
      where: { userId, workspaceId },
      orderBy: { practicedAt: 'desc' },
      select: { practicedAt: true },
      take: 365
    });

    let streak = 0;
    if (recentSessions.length > 0) {
      // Helper to get the start of day in the user's timezone
      const getLocalDayStart = (date) => {
        // Shift the UTC time by the timezone offset to get "local" time, then truncate to day
        const localMs = date.getTime() + tzOffsetMs;
        const localDay = new Date(localMs);
        localDay.setUTCHours(0, 0, 0, 0);
        return localDay.getTime();
      };

      const today = getLocalDayStart(new Date());
      const practiceDays = new Set(
        recentSessions.map(s => getLocalDayStart(new Date(s.practicedAt)))
      );

      const sortedDays = [...practiceDays].sort((a, b) => b - a);
      const oneDay = 24 * 60 * 60 * 1000;

      // Check if practiced today or yesterday (in user's timezone)
      if (sortedDays[0] >= today - oneDay) {
        streak = 1;
        for (let i = 1; i < sortedDays.length; i++) {
          if (sortedDays[i - 1] - sortedDays[i] === oneDay) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    res.json({
      songStats: songStats.map(s => ({
        songId: s.songId,
        totalMinutes: s._sum.duration || 0,
        lastPracticedAt: s._max.practicedAt,
        sessionCount: s._count.id
      })),
      totalMinutes: totals._sum.duration || 0,
      totalSessions: totals._count.id,
      streak
    });
  } catch (error) {
    console.error('Get practice summary error:', error);
    res.status(500).json({ error: 'Failed to get practice summary' });
  }
});

// Delete a practice session
router.delete('/:sessionId', authenticate, apiLimiter, async (req, res) => {
  try {
    const session = await prisma.practiceSession.findUnique({
      where: { id: req.params.sessionId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Practice session not found' });
    }

    // Check practice feature access
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const planLimits = getPlanLimits(workspace);
    if (!planLimits.features.practice) {
      return res.status(403).json({ error: 'Practice Tracker is a Pro feature. Upgrade to unlock.', upgrade: true });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Can only delete your own practice sessions' });
    }

    await prisma.practiceSession.delete({
      where: { id: req.params.sessionId }
    });

    res.json({ message: 'Practice session deleted' });
  } catch (error) {
    console.error('Delete practice session error:', error);
    res.status(500).json({ error: 'Failed to delete practice session' });
  }
});

export default router;
