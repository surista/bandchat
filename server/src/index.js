import 'dotenv/config';

// Validate JWT secrets at startup (warn, don't crash — secrets may be valid but short)
const WEAK_SECRETS = ['secret', 'password', 'jwt_secret', 'changeme', 'test', 'development', '12345678'];
function validateJwtSecrets() {
  for (const envVar of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[envVar];
    if (!value) {
      console.warn(`WARNING: ${envVar} is not set`);
    } else if (value.length < 32) {
      console.warn(`WARNING: ${envVar} is shorter than 32 characters (${value.length}). Consider using a longer secret.`);
    } else if (WEAK_SECRETS.includes(value.toLowerCase())) {
      console.warn(`WARNING: ${envVar} is set to a common/weak value. Please use a strong secret.`);
    }
  }
}
validateJwtSecrets();


import { createServer } from 'http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { setupSocketHandlers } from './socket/handlers.js';
import prisma from './lib/prisma.js';
import { createBackupWithVerification, cleanupOldBackups, sendBackupAlert } from './services/backup.js';
import { isConfigured as isR2Configured, deleteFile } from './lib/storage.js';

const app = createApp();
const httpServer = createServer(app);

// Parse allowed origins from environment (comma-separated)
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  maxHttpBufferSize: 1e6 // 1MB - prevent oversized payloads
});

// Make io accessible to routes
app.set('io', io);

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

// One-time database setup (idempotent - safe to run on every deploy)
async function setupDatabase() {
  try {
    // Enable pg_trgm extension and create trigram index for fast text search
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
    // $executeRawUnsafe is used here because $executeRaw tagged templates
    // run within implicit transactions which CONCURRENTLY does not support.
    await prisma.$executeRawUnsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_content_trgm_idx"
      ON "Message" USING gin (content gin_trgm_ops)
    `);
    console.log('Database setup complete (trigram index ready)');
  } catch (err) {
    // Index may already exist or CONCURRENTLY may fail in transaction - that's OK
    if (!err.message?.includes('already exists')) {
      console.error('Database setup warning:', err.message);
    }
  }
}

httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Run database setup
  await setupDatabase();

  // Track interval handles for graceful shutdown
  const intervalHandles = [];

  // Clean up expired refresh tokens every hour
  intervalHandles.push(setInterval(async () => {
    try {
      const { count } = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      if (count > 0) console.log(`Cleaned up ${count} expired refresh tokens`);
    } catch (err) {
      console.error('Refresh token cleanup error:', err);
    }
  }, 60 * 60 * 1000));

  // Daily database backup to R2 (first run 60s after start, then every 24h)
  const runScheduledBackup = async () => {
    try {
      const r2Available = await isR2Configured();
      if (!r2Available) return;

      console.log('Starting scheduled backup with verification...');
      const result = await createBackupWithVerification();

      if (result.verified) {
        console.log(`Scheduled backup complete: ${result.key} (${(result.size / 1024).toFixed(1)} KB, ${result.stats.messages} messages) ✓ verified`);
      } else {
        console.warn(`Scheduled backup created but verification failed: ${result.key}`, result.verificationErrors);
      }

      const cleanup = await cleanupOldBackups();
      if (cleanup.deleted > 0) console.log(`Backup cleanup: deleted ${cleanup.deleted} old backups`);
    } catch (err) {
      console.error('Scheduled backup error:', err);
      // Send alert on failure
      await sendBackupAlert('failure', { error: err.message }).catch(e => console.error('Failed to send backup alert:', e));
    }
  };
  const backupTimeout = setTimeout(() => {
    runScheduledBackup();
    intervalHandles.push(setInterval(runScheduledBackup, 24 * 60 * 60 * 1000));
  }, 60 * 1000);

  // Daily soft-delete purge: permanently delete records older than 30 days
  const SOFT_DELETE_GRACE_DAYS = 30;
  const runSoftDeletePurge = async () => {
    try {
      const cutoff = new Date(Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);

      // Purge expired users
      const expiredUsers = await prisma.user.findMany({
        where: { deletedAt: { not: null, lt: cutoff } },
        select: { id: true, displayName: true },
      });
      for (const user of expiredUsers) {
        try {
          await prisma.$transaction([
            prisma.message.updateMany({ where: { authorId: user.id }, data: { removedUserName: user.displayName, authorId: null } }),
            prisma.song.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.setlist.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.gig.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.medley.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.contact.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.announcement.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.poll.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.timelineEvent.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.recording.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.kittyTransaction.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.stagePlot.updateMany({ where: { createdById: user.id }, data: { removedCreatorName: user.displayName, createdById: null } }),
            prisma.pinnedMessage.updateMany({ where: { pinnedById: user.id }, data: { pinnedById: null } }),
            prisma.user.delete({ where: { id: user.id } }),
          ], { timeout: 30000 });
          console.log(`Purged soft-deleted user: ${user.displayName} (${user.id})`);
        } catch (err) {
          console.error(`Failed to purge user ${user.id}:`, err);
        }
      }

      // Purge expired workspaces
      const expiredWorkspaces = await prisma.workspace.findMany({
        where: { deletedAt: { not: null, lt: cutoff } },
        select: { id: true, name: true },
      });
      for (const ws of expiredWorkspaces) {
        try {
          // Clean up R2 files
          try {
            const r2Available = await isR2Configured();
            if (r2Available) {
              const [attachments, songAttachments, recordings, gigMedia] = await Promise.all([
                prisma.attachment.findMany({ where: { message: { channel: { workspaceId: ws.id } } }, select: { url: true } }),
                prisma.songAttachment.findMany({ where: { song: { workspaceId: ws.id } }, select: { url: true } }),
                prisma.recording.findMany({ where: { workspaceId: ws.id }, select: { url: true } }),
                prisma.gigMedia.findMany({ where: { gig: { workspaceId: ws.id } }, select: { url: true } }),
              ]);
              const r2PublicUrl = process.env.R2_PUBLIC_URL || '';
              const allUrls = [...attachments, ...songAttachments, ...recordings, ...gigMedia].map(r => r.url);
              for (const url of allUrls) {
                if (url.startsWith(r2PublicUrl)) {
                  try { await deleteFile(url.replace(`${r2PublicUrl}/`, '')); } catch { /* best effort */ }
                }
              }
            }
          } catch (err) {
            console.error(`R2 cleanup warning during workspace purge ${ws.id}:`, err);
          }

          await prisma.workspace.delete({ where: { id: ws.id } });
          console.log(`Purged soft-deleted workspace: ${ws.name} (${ws.id})`);
        } catch (err) {
          console.error(`Failed to purge workspace ${ws.id}:`, err);
        }
      }

      const total = expiredUsers.length + expiredWorkspaces.length;
      if (total > 0) console.log(`Soft-delete purge complete: ${expiredUsers.length} users, ${expiredWorkspaces.length} workspaces`);
    } catch (err) {
      console.error('Soft-delete purge error:', err);
    }
  };
  // Run purge 2 minutes after start, then every 24 hours
  const purgeTimeout = setTimeout(() => {
    runSoftDeletePurge();
    intervalHandles.push(setInterval(runSoftDeletePurge, 24 * 60 * 60 * 1000));
  }, 2 * 60 * 1000);

  // Store timeout handles for cleanup
  app.set('_intervalHandles', intervalHandles);
  app.set('_timeoutHandles', [backupTimeout, purgeTimeout]);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);

  // Clear all scheduled intervals and timeouts
  const intervals = app.get('_intervalHandles') || [];
  const timeouts = app.get('_timeoutHandles') || [];
  intervals.forEach(h => clearInterval(h));
  timeouts.forEach(h => clearTimeout(h));

  // Close Socket.IO connections
  io.close();

  httpServer.close(async () => {
    console.log('HTTP server closed');
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

export { io };
