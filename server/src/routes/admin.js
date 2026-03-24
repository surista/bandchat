import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { authenticate, isSystemAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { logAudit } from '../lib/audit.js';
import { listAllObjects, deleteFile, isConfigured as isR2Configured } from '../lib/storage.js';
import { createBackup, listBackups, getBackupStream, cleanupOldBackups, previewBackup, restoreFromBackup, createWorkspaceBackup, listWorkspaceBackups, previewWorkspaceBackup, restoreWorkspaceBackup, cleanupWorkspaceBackups } from '../services/backup.js';

const router = express.Router();

// Dedicated admin rate limiter: 30 requests per minute
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  skip: process.env.NODE_ENV === 'test' ? () => true : undefined,
  message: { error: 'Too many admin requests, please try again later' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// All admin routes require authentication + system admin + rate limiting
router.use(authenticate, isSystemAdmin, adminLimiter);

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
    if (search && search.length > 200) return res.status(400).json({ error: 'Search query too long' });
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
    if (search && search.length > 200) return res.status(400).json({ error: 'Search query too long' });
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
          slug: true,
          plan: true,
          planSource: true,
          planExpiresAt: true,
          storageUsedBytes: true,
          createdAt: true,
          _count: {
            select: { members: true, channels: true },
          },
          members: {
            where: { role: 'ADMIN' },
            take: 1,
            orderBy: { joinedAt: 'asc' },
            select: { user: { select: { displayName: true, email: true } } },
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

    const items = workspaces.map(w => {
      const admin = w.members?.[0]?.user;
      return {
        ...w,
        members: undefined,
        owner: admin ? { displayName: admin.displayName, email: admin.email } : null,
        messageCount: wsMessageCounts[w.id] || 0,
      };
    });

    res.json({ workspaces: items, total, page, limit });
  } catch (error) {
    console.error('Admin workspaces error:', error);
    res.status(500).json({ error: 'Failed to load workspaces' });
  }
});

// POST /api/admin/workspaces/:workspaceId/plan — Toggle workspace plan (FREE ↔ PRO)
router.post('/workspaces/:workspaceId/plan', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, plan: true },
    });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const newPlan = workspace.plan === 'PRO' ? 'FREE' : 'PRO';
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: newPlan,
        planSource: newPlan === 'PRO' ? 'MANUAL' : null,
        planExpiresAt: null,
      },
      select: { id: true, name: true, plan: true, planSource: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Admin plan toggle error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
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

// GET /api/admin/storage/stats — Storage overview
router.get('/storage/stats', async (req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, storageUsedBytes: true },
      orderBy: { storageUsedBytes: 'desc' },
    });

    const totalTracked = workspaces.reduce((sum, w) => sum + (w.storageUsedBytes ?? 0n), 0n);

    // Check if R2 is configured
    let r2Available = false;
    try { r2Available = await isR2Configured(); } catch { /* ignore */ }

    res.json({
      totalTrackedBytes: totalTracked.toString(),
      workspaces: workspaces.map(w => ({
        id: w.id,
        name: w.name,
        storageUsedBytes: (w.storageUsedBytes ?? 0n).toString(),
      })),
      r2Available,
    });
  } catch (error) {
    console.error('Admin storage stats error:', error);
    res.status(500).json({ error: 'Failed to load storage stats' });
  }
});

// Shared helper: find orphaned R2 files (not referenced by any DB record)
async function findOrphans() {
  const r2Objects = await listAllObjects();

  const [attachments, songAttachments, recordings, gigMedia, users, bandMembers, timelineEvents] = await Promise.all([
    prisma.attachment.findMany({ select: { url: true } }),
    prisma.songAttachment.findMany({ select: { url: true } }),
    prisma.recording.findMany({ select: { url: true } }),
    prisma.gigMedia.findMany({ select: { url: true } }),
    prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    prisma.bandMember.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.timelineEvent.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
  ]);

  const knownUrls = new Set();
  for (const a of attachments) knownUrls.add(a.url);
  for (const a of songAttachments) knownUrls.add(a.url);
  for (const r of recordings) knownUrls.add(r.url);
  for (const g of gigMedia) knownUrls.add(g.url);
  for (const u of users) if (u.avatarUrl) knownUrls.add(u.avatarUrl);
  for (const b of bandMembers) if (b.imageUrl) knownUrls.add(b.imageUrl);
  for (const t of timelineEvents) if (t.imageUrl) knownUrls.add(t.imageUrl);

  const r2PublicUrl = process.env.R2_PUBLIC_URL || '';
  const orphans = r2Objects.filter(obj => !knownUrls.has(`${r2PublicUrl}/${obj.key}`));

  return { r2Objects, knownUrls, orphans };
}

// GET /api/admin/storage/orphans — Find orphaned R2 files
router.get('/storage/orphans', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.status(400).json({ error: 'R2 storage not configured' });
    }

    const { r2Objects, knownUrls, orphans } = await findOrphans();
    const totalOrphanBytes = orphans.reduce((sum, o) => sum + (o.size || 0), 0);

    res.json({
      totalR2Objects: r2Objects.length,
      knownUrlCount: knownUrls.size,
      orphanCount: orphans.length,
      orphanBytes: totalOrphanBytes,
      orphans: orphans.slice(0, 100).map(o => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
      })),
    });
  } catch (error) {
    console.error('Admin orphan scan error:', error);
    res.status(500).json({ error: 'Failed to scan for orphans' });
  }
});

// POST /api/admin/storage/cleanup — Delete orphaned R2 files
router.post('/storage/cleanup', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.status(400).json({ error: 'R2 storage not configured' });
    }

    const { dryRun = true } = req.body;
    const { orphans } = await findOrphans();

    if (dryRun) {
      const totalBytes = orphans.reduce((sum, o) => sum + (o.size || 0), 0);
      return res.json({
        dryRun: true,
        wouldDelete: orphans.length,
        wouldFreeBytes: totalBytes,
        files: orphans.slice(0, 50).map(o => o.key),
      });
    }

    // Actually delete orphans
    let deleted = 0;
    let freedBytes = 0;
    for (const orphan of orphans) {
      try {
        await deleteFile(orphan.key);
        deleted++;
        freedBytes += orphan.size || 0;
      } catch (err) {
        console.error(`Failed to delete orphan ${orphan.key}:`, err);
      }
    }

    res.json({ deleted, freedBytes });
  } catch (error) {
    console.error('Admin cleanup error:', error);
    res.status(500).json({ error: 'Failed to clean up orphans' });
  }
});

// POST /api/admin/storage/recalculate — Recalculate storage usage per workspace
router.post('/storage/recalculate', async (req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    const results = [];

    for (const ws of workspaces) {
      // Sum sizes from all models that store file URLs for this workspace
      const [attachmentSum, songAttachmentSum, recordingSum, gigMediaSum] = await Promise.all([
        prisma.attachment.aggregate({
          where: { message: { channel: { workspaceId: ws.id } } },
          _sum: { size: true },
        }),
        prisma.songAttachment.aggregate({
          where: { song: { workspaceId: ws.id } },
          _sum: { size: true },
        }),
        prisma.recording.aggregate({
          where: { workspaceId: ws.id },
          _sum: { size: true },
        }),
        prisma.gigMedia.aggregate({
          where: { gig: { workspaceId: ws.id } },
          _sum: { size: true },
        }),
      ]);

      const totalBytes = BigInt(attachmentSum._sum.size || 0) +
        BigInt(songAttachmentSum._sum.size || 0) +
        BigInt(recordingSum._sum.size || 0) +
        BigInt(gigMediaSum._sum.size || 0);

      await prisma.workspace.update({
        where: { id: ws.id },
        data: { storageUsedBytes: totalBytes },
      });

      results.push({
        id: ws.id,
        name: ws.name,
        storageUsedBytes: totalBytes.toString(),
      });
    }

    res.json({ recalculated: results.length, workspaces: results });
  } catch (error) {
    console.error('Admin recalculate error:', error);
    res.status(500).json({ error: 'Failed to recalculate storage' });
  }
});

// POST /api/admin/backups — Trigger a manual backup
router.post('/backups', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.status(400).json({ error: 'R2 storage not configured. Cannot create backup.' });
    }

    console.log('Manual backup triggered by', req.user.email);
    const result = await createBackup();
    console.log(`Backup complete: ${result.key} (${(result.size / 1024).toFixed(1)} KB)`);

    // Run cleanup after backup
    const cleanup = await cleanupOldBackups();

    res.json({ ...result, cleanup });
  } catch (error) {
    console.error('Backup error:', error);
    console.error('Backup details:', error.message);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// GET /api/admin/backups — List all backups
router.get('/backups', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.json({ backups: [], r2Available: false });
    }

    const backups = await listBackups();
    res.json({ backups, r2Available: true });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// GET /api/admin/backups/download/:filename — Download a backup file
router.get('/backups/download/:filename', async (req, res) => {
  try {
    // Path traversal protection: sanitize filename
    const filename = path.basename(req.params.filename);
    if (filename !== req.params.filename || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const key = `backups/${filename}`;
    const { stream, size, contentType } = await getBackupStream(key);

    res.set({
      'Content-Type': contentType || 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    if (size) res.set('Content-Length', size);

    stream.pipe(res);
  } catch (error) {
    console.error('Backup download error:', error);
    res.status(404).json({ error: 'Backup not found' });
  }
});

// POST /api/admin/backups/restore-preview — Preview a backup's contents before restoring
router.post('/backups/restore-preview', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key || !key.startsWith('backups/') || key.includes('..')) {
      return res.status(400).json({ error: 'Invalid backup key' });
    }

    const preview = await previewBackup(key);
    res.json(preview);
  } catch (error) {
    console.error('Backup preview error:', error);
    console.error('Preview details:', error.message);
    res.status(500).json({ error: 'Failed to preview backup' });
  }
});

// POST /api/admin/backups/restore — Restore the database from a backup
let restoreInProgress = false;

router.post('/backups/restore', async (req, res) => {
  try {
    const { key, confirmPhrase } = req.body;

    if (!key || !key.startsWith('backups/') || key.includes('..')) {
      return res.status(400).json({ error: 'Invalid backup key' });
    }
    if (confirmPhrase !== 'RESTORE DATABASE') {
      return res.status(400).json({ error: 'Invalid confirmation phrase. Type "RESTORE DATABASE" to confirm.' });
    }
    if (restoreInProgress) {
      return res.status(409).json({ error: 'A restore operation is already in progress' });
    }

    restoreInProgress = true;
    console.log(`DATABASE RESTORE initiated by ${req.user.email} from backup: ${key}`);

    const result = await restoreFromBackup(key, (stage, detail) => {
      console.log(`Restore [${stage}]: ${detail}`);
    });

    console.log(`DATABASE RESTORE complete. Safety backup: ${result.safetyBackupKey}`);
    res.json(result);
  } catch (error) {
    console.error('Database restore error:', error);
    console.error('Restore details:', error.message);
    res.status(500).json({ error: 'Restore failed' });
  } finally {
    restoreInProgress = false;
  }
});

// ==========================================
// Workspace-Scoped Backups
// ==========================================

// POST /api/admin/workspaces/:workspaceId/backup — Trigger a workspace backup
router.post('/workspaces/:workspaceId/backup', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.status(400).json({ error: 'R2 storage not configured.' });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, select: { id: true } });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    console.log(`Workspace backup triggered by ${req.user.email} for workspace ${req.params.workspaceId}`);
    const result = await createWorkspaceBackup(req.params.workspaceId);
    console.log(`Workspace backup complete: ${result.key} (${(result.size / 1024).toFixed(1)} KB)`);

    // Cleanup old backups beyond limit
    const cleanup = await cleanupWorkspaceBackups(req.params.workspaceId);

    res.json({ ...result, cleanup });
  } catch (error) {
    console.error('Workspace backup error:', error);
    res.status(500).json({ error: 'Workspace backup failed' });
  }
});

// GET /api/admin/workspaces/:workspaceId/backups — List workspace backups
router.get('/workspaces/:workspaceId/backups', async (req, res) => {
  try {
    const r2Available = await isR2Configured();
    if (!r2Available) {
      return res.json({ backups: [], r2Available: false });
    }

    const backups = await listWorkspaceBackups(req.params.workspaceId);
    res.json({ backups, r2Available: true });
  } catch (error) {
    console.error('List workspace backups error:', error);
    res.status(500).json({ error: 'Failed to list workspace backups' });
  }
});

// POST /api/admin/workspace-backups/preview — Preview a workspace backup
router.post('/workspace-backups/preview', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key || !key.startsWith('backups/workspace/') || key.includes('..')) {
      return res.status(400).json({ error: 'Invalid backup key' });
    }

    const preview = await previewWorkspaceBackup(key);
    res.json(preview);
  } catch (error) {
    console.error('Workspace backup preview error:', error);
    res.status(500).json({ error: 'Failed to preview workspace backup' });
  }
});

// POST /api/admin/workspace-backups/restore — Restore a workspace from backup
router.post('/workspace-backups/restore', async (req, res) => {
  try {
    const { key, confirmPhrase } = req.body;

    if (!key || !key.startsWith('backups/workspace/') || key.includes('..')) {
      return res.status(400).json({ error: 'Invalid backup key' });
    }
    if (confirmPhrase !== 'RESTORE WORKSPACE') {
      return res.status(400).json({ error: 'Invalid confirmation phrase. Type "RESTORE WORKSPACE" to confirm.' });
    }

    console.log(`WORKSPACE RESTORE initiated by ${req.user.email} from backup: ${key}`);

    const result = await restoreWorkspaceBackup(key, (stage, detail) => {
      console.log(`Workspace Restore [${stage}]: ${detail}`);
    });

    console.log(`WORKSPACE RESTORE complete.`);
    res.json(result);
  } catch (error) {
    console.error('Workspace restore error:', error);
    res.status(500).json({ error: 'Workspace restore failed' });
  }
});

// GET /api/admin/workspace-backups/download/:workspaceId/:filename — Download a workspace backup
router.get('/workspace-backups/download/:workspaceId/:filename', async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const filename = path.basename(req.params.filename);
    if (filename !== req.params.filename || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    // Validate workspaceId is a UUID to prevent path traversal
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      return res.status(400).json({ error: 'Invalid workspace ID' });
    }

    const key = `backups/workspace/${workspaceId}/${filename}`;
    const { stream, size, contentType } = await getBackupStream(key);

    res.set({
      'Content-Type': contentType || 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    if (size) res.set('Content-Length', size);

    stream.pipe(res);
  } catch (error) {
    console.error('Workspace backup download error:', error);
    res.status(404).json({ error: 'Workspace backup not found' });
  }
});

// ==========================================
// Soft-Delete: List / Restore / Purge
// ==========================================

const SOFT_DELETE_GRACE_DAYS = 30;

// GET /api/admin/deleted — List soft-deleted users and workspaces
router.get('/deleted', async (req, res) => {
  try {
    const [deletedUsers, deletedWorkspaces] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { workspaces: true, messages: true } },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.workspace.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { members: true, channels: true } },
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);

    const now = Date.now();
    const formatItem = (item) => {
      const deletedMs = new Date(item.deletedAt).getTime();
      const daysElapsed = (now - deletedMs) / (1000 * 60 * 60 * 24);
      const daysRemaining = Math.max(0, Math.ceil(SOFT_DELETE_GRACE_DAYS - daysElapsed));
      return { ...item, daysRemaining };
    };

    res.json({
      users: deletedUsers.map(formatItem),
      workspaces: deletedWorkspaces.map(formatItem),
      graceDays: SOFT_DELETE_GRACE_DAYS,
    });
  } catch (error) {
    console.error('Admin deleted list error:', error);
    res.status(500).json({ error: 'Failed to load deleted items' });
  }
});

// POST /api/admin/users/:userId/restore — Restore a soft-deleted user
router.post('/users/:userId/restore', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, deletedAt: { not: null } },
      select: { id: true, displayName: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'Deleted user not found' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null },
    });

    logAudit('admin.user.restored', { actorId: req.user.id, targetId: req.params.userId, metadata: { displayName: user.displayName } });
    res.json({ message: `User "${user.displayName}" restored successfully` });
  } catch (error) {
    console.error('Admin user restore error:', error);
    res.status(500).json({ error: 'Failed to restore user' });
  }
});

// DELETE /api/admin/workspaces/:workspaceId — Soft-delete a workspace (30-day grace period)
router.delete('/workspaces/:workspaceId', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: req.params.workspaceId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { deletedAt: new Date() },
    });

    res.json({ message: `Workspace "${workspace.name}" soft-deleted (30-day grace period)` });
  } catch (error) {
    console.error('Admin workspace soft-delete error:', error);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// POST /api/admin/workspaces/:workspaceId/restore — Restore a soft-deleted workspace
router.post('/workspaces/:workspaceId/restore', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: req.params.workspaceId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Deleted workspace not found' });
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { deletedAt: null },
    });

    logAudit('admin.workspace.restored', { actorId: req.user.id, targetId: req.params.workspaceId, metadata: { name: workspace.name } });
    res.json({ message: `Workspace "${workspace.name}" restored successfully` });
  } catch (error) {
    console.error('Admin workspace restore error:', error);
    res.status(500).json({ error: 'Failed to restore workspace' });
  }
});

// DELETE /api/admin/users/:userId/purge — Permanently delete a soft-deleted user
router.delete('/users/:userId/purge', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, deletedAt: { not: null } },
      select: { id: true, displayName: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'Deleted user not found' });
    }

    const userId = user.id;
    const displayName = user.displayName;

    // Anonymize and hard-delete (same logic as old account deletion)
    await prisma.$transaction([
      prisma.message.updateMany({
        where: { authorId: userId },
        data: { removedUserName: displayName, authorId: null },
      }),
      prisma.song.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.setlist.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.gig.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.medley.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.contact.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.announcement.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.poll.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.timelineEvent.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.recording.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.kittyTransaction.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.stagePlot.updateMany({ where: { createdById: userId }, data: { removedCreatorName: displayName, createdById: null } }),
      prisma.pinnedMessage.updateMany({ where: { pinnedById: userId }, data: { pinnedById: null } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    console.log(`Admin purged user: ${displayName} (${userId})`);
    logAudit('admin.user.purged', { actorId: req.user.id, targetId: userId, metadata: { displayName } });
    res.json({ message: `User "${displayName}" permanently deleted` });
  } catch (error) {
    console.error('Admin user purge error:', error);
    res.status(500).json({ error: 'Failed to purge user' });
  }
});

// DELETE /api/admin/workspaces/:workspaceId/purge — Permanently delete a soft-deleted workspace
router.delete('/workspaces/:workspaceId/purge', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: req.params.workspaceId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Deleted workspace not found' });
    }

    // Clean up R2 files for this workspace before hard delete
    try {
      const r2Available = await isR2Configured();
      if (r2Available) {
        const [attachments, songAttachments, recordings, gigMedia] = await Promise.all([
          prisma.attachment.findMany({ where: { message: { channel: { workspaceId: workspace.id } } }, select: { url: true } }),
          prisma.songAttachment.findMany({ where: { song: { workspaceId: workspace.id } }, select: { url: true } }),
          prisma.recording.findMany({ where: { workspaceId: workspace.id }, select: { url: true } }),
          prisma.gigMedia.findMany({ where: { gig: { workspaceId: workspace.id } }, select: { url: true } }),
        ]);

        const r2PublicUrl = process.env.R2_PUBLIC_URL || '';
        const allUrls = [...attachments, ...songAttachments, ...recordings, ...gigMedia].map(r => r.url);
        for (const url of allUrls) {
          if (url.startsWith(r2PublicUrl)) {
            const key = url.replace(`${r2PublicUrl}/`, '');
            try { await deleteFile(key); } catch { /* best effort */ }
          }
        }
      }
    } catch (err) {
      console.error('R2 cleanup warning during workspace purge:', err);
    }

    // Clean up workspace backups from R2
    try {
      const r2Available = await isR2Configured();
      if (r2Available) {
        const wsBackups = await listWorkspaceBackups(workspace.id);
        for (const b of wsBackups) {
          try { await deleteFile(b.key); } catch { /* best effort */ }
        }
      }
    } catch (err) {
      console.error('R2 workspace backup cleanup warning during purge:', err);
    }

    // Cascade delete handles all child records
    await prisma.workspace.delete({ where: { id: workspace.id } });

    console.log(`Admin purged workspace: ${workspace.name} (${workspace.id})`);
    logAudit('admin.workspace.purged', { actorId: req.user.id, targetId: workspace.id, metadata: { name: workspace.name } });
    res.json({ message: `Workspace "${workspace.name}" permanently deleted` });
  } catch (error) {
    console.error('Admin workspace purge error:', error);
    res.status(500).json({ error: 'Failed to purge workspace' });
  }
});

// --- Audit Log ---

// GET /api/admin/audit — List audit log entries
router.get('/audit', async (req, res) => {
  try {
    const { action, actorId, limit = 50, cursor } = req.query;
    const take = Math.min(parseInt(limit) || 50, 200);

    const where = {};
    if (action) where.action = { startsWith: action };
    if (actorId) where.actorId = actorId;

    const entries = await prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = entries.length > take;
    if (hasMore) entries.pop();

    res.json({
      entries,
      hasMore,
      nextCursor: hasMore ? entries[entries.length - 1]?.id : null,
    });
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /api/admin/audit/stats — Audit log summary
router.get('/audit/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [total, last24hCount, last7dCount, topActions] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: last7d } } }),
      prisma.$queryRaw`SELECT action, COUNT(*)::int as count FROM "AuditLog" WHERE "createdAt" >= ${last7d} GROUP BY action ORDER BY count DESC LIMIT 10`,
    ]);

    res.json({ total, last24h: last24hCount, last7d: last7dCount, topActions });
  } catch (error) {
    console.error('Audit stats error:', error);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

export default router;
