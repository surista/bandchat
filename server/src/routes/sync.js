import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

/**
 * GET /api/sync/:workspaceId/pull
 * Delta sync: returns records updated since `since` timestamp.
 * Query params:
 *   - since: ISO timestamp (omit for initial sync)
 *   - entities: comma-separated list (channels,messages,songs,gigs,members)
 */
router.get('/:workspaceId/pull', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const since = req.query.since ? new Date(req.query.since) : null;
    const entities = req.query.entities
      ? req.query.entities.split(',')
      : ['channels', 'messages', 'songs', 'gigs', 'members'];

    const serverTime = new Date().toISOString();
    const result = { serverTime };
    const sinceFilter = since ? { gt: since } : undefined;

    if (entities.includes('channels')) {
      // Get channels user is a member of
      const memberships = await prisma.channelMember.findMany({
        where: { channel: { workspaceId }, userId: req.user.id },
        select: { channelId: true },
      });
      const channelIds = memberships.map(m => m.channelId);

      result.channels = await prisma.channel.findMany({
        where: {
          id: { in: channelIds },
          ...(sinceFilter && { updatedAt: sinceFilter }),
        },
        include: {
          members: {
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
          _count: { select: { messages: true } },
        },
      });

      // Note: channels are hard-deleted (cascade), so we can't query for
      // deletions. The client detects missing channels on next full sync.
    }

    if (entities.includes('messages')) {
      // Get messages from user's channels, max 500 per pull
      const memberships = await prisma.channelMember.findMany({
        where: { channel: { workspaceId }, userId: req.user.id },
        select: { channelId: true },
      });
      const channelIds = memberships.map(m => m.channelId);

      result.messages = await prisma.message.findMany({
        where: {
          channelId: { in: channelIds },
          parentId: null, // Only top-level messages
          ...(sinceFilter && { updatedAt: sinceFilter }),
        },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
          attachments: true,
          reactions: true,
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      // Messages are hard-deleted — deletions handled via socket events
    }

    if (entities.includes('songs')) {
      result.songs = await prisma.song.findMany({
        where: {
          workspaceId,
          ...(sinceFilter && { updatedAt: sinceFilter }),
        },
        include: {
          createdBy: { select: { id: true, displayName: true } },
          _count: { select: { setlistSongs: true, gigSongs: true } },
        },
        take: 500,
      });

      // Songs are hard-deleted — deletions handled via socket events
    }

    if (entities.includes('gigs')) {
      result.gigs = await prisma.gig.findMany({
        where: {
          workspaceId,
          ...(sinceFilter && { updatedAt: sinceFilter }),
        },
        include: {
          attendees: {
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
          setlists: {
            include: { setlist: { select: { id: true, name: true } } },
          },
        },
        take: 500,
      });

      // Gigs are hard-deleted — deletions handled via socket events
    }

    if (entities.includes('members')) {
      // WorkspaceMember doesn't have updatedAt — always return full list
      result.members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Failed to pull sync data' });
  }
});

/**
 * POST /api/sync/:workspaceId/push
 * Receives offline mutations and processes them.
 * Body: { operations: [{ operation, entity, entityId, payload }] }
 * Returns: { results: [{ tempId, serverId, status, data }] }
 */
router.post('/:workspaceId/push', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { operations } = req.body;

    if (!Array.isArray(operations) || operations.length > 100) {
      return res.status(400).json({ error: 'Invalid operations (max 100)' });
    }

    const ALLOWED_ENTITIES = ['message', 'song', 'gig'];
    const ALLOWED_OPERATIONS = ['create', 'update', 'delete'];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const results = [];

    for (const op of operations) {
      const { operation, entity, entityId, payload } = op;

      if (!ALLOWED_ENTITIES.includes(entity) || !ALLOWED_OPERATIONS.includes(operation)) {
        results.push({ tempId: entityId, status: 'error', error: 'Invalid operation' });
        continue;
      }

      try {
        let result = null;

        if (entity === 'message' && operation === 'create') {
          if (!payload?.channelId || !UUID_REGEX.test(payload.channelId)) {
            results.push({ tempId: entityId, status: 'error', error: 'Invalid channel ID' });
            continue;
          }
          // Verify user is channel member
          const membership = await prisma.channelMember.findFirst({
            where: { channelId: payload.channelId, userId: req.user.id },
          });
          if (!membership) {
            results.push({ tempId: entityId, status: 'error', error: 'Not a channel member' });
            continue;
          }

          result = await prisma.message.create({
            data: {
              content: (typeof payload.content === 'string' ? payload.content : '').slice(0, 10000),
              channelId: payload.channelId,
              authorId: req.user.id,
            },
            include: {
              author: { select: { id: true, displayName: true, avatarUrl: true } },
              attachments: true,
              reactions: true,
              _count: { select: { replies: true } },
            },
          });

          // Emit via socket for real-time
          const io = req.app.get('io');
          if (io) {
            io.to(`channel:${payload.channelId}`).emit('message:new', result);
          }
        }

        if (entity === 'message' && operation === 'delete') {
          const msg = await prisma.message.findUnique({ where: { id: entityId } });
          if (msg && msg.authorId === req.user.id) {
            await prisma.message.delete({ where: { id: entityId } });
            const io = req.app.get('io');
            if (io) {
              io.to(`channel:${msg.channelId}`).emit('message:deleted', { messageId: entityId, channelId: msg.channelId });
            }
          }
        }

        results.push({
          tempId: entityId,
          serverId: result?.id || entityId,
          status: 'success',
          data: result,
        });
      } catch (err) {
        console.error('Sync push operation error:', err.message);
        results.push({
          tempId: entityId,
          status: 'error',
          error: 'Operation failed',
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Failed to push sync data' });
  }
});

export default router;
