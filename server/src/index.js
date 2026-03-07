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
import { isConfigured as isR2Configured } from './lib/storage.js';

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
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
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

  // Clean up expired refresh tokens every hour
  setInterval(async () => {
    try {
      const { count } = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      if (count > 0) console.log(`Cleaned up ${count} expired refresh tokens`);
    } catch (err) {
      console.error('Refresh token cleanup error:', err);
    }
  }, 60 * 60 * 1000);

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
  setTimeout(() => {
    runScheduledBackup();
    setInterval(runScheduledBackup, 24 * 60 * 60 * 1000);
  }, 60 * 1000);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
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

export { io };
