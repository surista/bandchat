import 'dotenv/config';

import { createServer } from 'http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { setupSocketHandlers } from './socket/handlers.js';
import prisma from './lib/prisma.js';
import { createBackup, cleanupOldBackups } from './services/backup.js';
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
  }
});

// Make io accessible to routes
app.set('io', io);

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

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

      console.log('Starting scheduled backup...');
      const result = await createBackup();
      console.log(`Scheduled backup complete: ${result.key} (${(result.size / 1024).toFixed(1)} KB, ${result.stats.messages} messages)`);

      const cleanup = await cleanupOldBackups();
      if (cleanup.deleted > 0) console.log(`Backup cleanup: deleted ${cleanup.deleted} old backups`);
    } catch (err) {
      console.error('Scheduled backup error:', err);
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
