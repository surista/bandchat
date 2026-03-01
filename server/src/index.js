import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import channelRoutes from './routes/channels.js';
import channelGroupRoutes from './routes/channelGroups.js';
import messageRoutes from './routes/messages.js';
import pushRoutes from './routes/push.js';
import uploadRoutes from './routes/uploads.js';
import songRoutes from './routes/songs.js';
import setlistRoutes from './routes/setlists.js';
import gigRoutes from './routes/gigs.js';
import bandMemberRoutes from './routes/bandMembers.js';
import availabilityRoutes from './routes/availability.js';
import contactRoutes from './routes/contacts.js';
import announcementRoutes from './routes/announcements.js';
import pollRoutes from './routes/polls.js';
import medleyRoutes from './routes/medleys.js';
import timelineRoutes from './routes/timeline.js';
import achievementRoutes from './routes/achievements.js';
import recordingRoutes from './routes/recordings.js';
import suggestionRoutes from './routes/suggestions.js';
import kittyRoutes from './routes/kitty.js';
import linkPreviewRoutes from './routes/linkPreview.js';
import slackImportRoutes from './routes/slackImport.js';
import reportRoutes from './routes/reports.js';
import blockRoutes from './routes/blocks.js';
import practiceRoutes from './routes/practice.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { apiLimiter } from './middleware/rateLimit.js';
import prisma from './lib/prisma.js';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway)
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

// Derive specific WebSocket origins from allowedOrigins
const wsOrigins = allowedOrigins.map(origin => {
  if (origin.startsWith('https://')) {
    return origin.replace('https://', 'wss://');
  }
  if (origin.startsWith('http://')) {
    return origin.replace('http://', 'ws://');
  }
  return origin;
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", ...wsOrigins, ...allowedOrigins],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Allow embedding external resources (Cloudinary images, etc.)
}));
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
app.use('/api', apiLimiter);

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/channel-groups', channelGroupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/setlists', setlistRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/band-members', bandMemberRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/medleys', medleyRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/kitty', kittyRoutes);
app.use('/api/link-preview', linkPreviewRoutes);
app.use('/api/slack-import', slackImportRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/practice', practiceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler (must be after all routes)
app.use((err, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

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
