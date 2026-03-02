import express from 'express';
import { authenticate, isSystemAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// All admin routes require authentication + system admin
router.use(authenticate, isSystemAdmin);

// GET /api/admin/stats — Dashboard overview
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      usersLast7d,
      usersLast30d,
      totalWorkspaces,
      workspacesLast7d,
      workspacesLast30d,
      totalMessages,
      messagesLast7d,
      messagesLast30d,
      totalSongs,
      totalSetlists,
      totalGigs,
      activeUsers7d,
      authProviders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.workspace.count(),
      prisma.workspace.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.workspace.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.message.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.song.count(),
      prisma.setlist.count(),
      prisma.gig.count(),
      // Active users = distinct users with refresh tokens updated in last 7 days
      prisma.refreshToken.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }).then(tokens => tokens.length),
      prisma.user.groupBy({
        by: ['authProvider'],
        _count: { id: true },
      }),
    ]);

    res.json({
      users: { total: totalUsers, last7d: usersLast7d, last30d: usersLast30d },
      workspaces: { total: totalWorkspaces, last7d: workspacesLast7d, last30d: workspacesLast30d },
      messages: { total: totalMessages, last7d: messagesLast7d, last30d: messagesLast30d },
      songs: totalSongs,
      setlists: totalSetlists,
      gigs: totalGigs,
      activeUsers7d,
      authProviders: authProviders.reduce((acc, p) => {
        acc[p.authProvider] = p._count.id;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/users — User list with search and pagination
router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          authProvider: true,
          emailVerified: true,
          isSystemAdmin: true,
          createdAt: true,
          _count: { select: { workspaces: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, limit });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/admin/users/:userId — User detail
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        authProvider: true,
        emailVerified: true,
        isSystemAdmin: true,
        createdAt: true,
        updatedAt: true,
        workspaces: {
          include: {
            workspace: { select: { id: true, name: true, createdAt: true } },
          },
        },
        _count: {
          select: { messages: true, songs: true, gigs: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// GET /api/admin/workspaces — Workspace list with search and pagination
router.get('/workspaces', async (req, res) => {
  try {
    const { search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);

    const where = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: { members: true, channels: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.workspace.count({ where }),
    ]);

    // Get message counts per workspace via channels (parallel queries)
    const workspaceIds = workspaces.map(w => w.id);
    const [messageCounts, channels] = await Promise.all([
      prisma.message.groupBy({
        by: ['channelId'],
        where: {
          channel: { workspaceId: { in: workspaceIds } },
        },
        _count: { id: true },
      }),
      prisma.channel.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true },
      }),
    ]);
    const channelToWorkspace = {};
    for (const ch of channels) {
      channelToWorkspace[ch.id] = ch.workspaceId;
    }

    const wsMessageCounts = {};
    for (const mc of messageCounts) {
      const wsId = channelToWorkspace[mc.channelId];
      if (wsId) {
        wsMessageCounts[wsId] = (wsMessageCounts[wsId] || 0) + mc._count.id;
      }
    }

    const items = workspaces.map(w => ({
      ...w,
      messageCount: wsMessageCounts[w.id] || 0,
    }));

    res.json({ workspaces: items, total, page, limit });
  } catch (error) {
    console.error('Admin workspaces error:', error);
    res.status(500).json({ error: 'Failed to load workspaces' });
  }
});

// POST /api/admin/users/:userId/toggle-admin — Toggle system admin
router.post('/users/:userId/toggle-admin', async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent revoking your own admin
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own system admin status' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSystemAdmin: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isSystemAdmin: !user.isSystemAdmin },
      select: { id: true, displayName: true, isSystemAdmin: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Admin toggle error:', error);
    res.status(500).json({ error: 'Failed to update admin status' });
  }
});

export default router;
