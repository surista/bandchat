import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// BigInt JSON serialization support (Prisma returns BigInt for storageUsedBytes)
BigInt.prototype.toJSON = function () { return Number(this); };

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
import workspaceImportRoutes from './routes/workspaceImport.js';
import adminRoutes from './routes/admin.js';
import { apiLimiter } from './middleware/rateLimit.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Parse allowed origins from environment (comma-separated)
  const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173'];

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

  // R2 public URL for CSP (if configured)
  const r2PublicUrl = process.env.R2_PUBLIC_URL || '';
  const r2CspDomain = r2PublicUrl ? r2PublicUrl.replace(/\/$/, '') : null;

  // Admin dashboard — standalone HTML with its own CSP (served before Helmet)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const adminImgSrc = ['self', 'data:', 'https://res.cloudinary.com', r2CspDomain].filter(Boolean).join(' ');
  app.get('/admin', (req, res) => {
    res.setHeader('Content-Security-Policy',
      `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com${r2CspDomain ? ' ' + r2CspDomain : ''}; connect-src 'self'; frame-ancestors 'none'; media-src 'self' https://res.cloudinary.com${r2CspDomain ? ' ' + r2CspDomain : ''}`
    );
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  });

  // Build img/media source lists for CSP
  const imgSources = ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.googleusercontent.com"];
  const mediaSources = ["'self'", "https://res.cloudinary.com"];
  if (r2CspDomain) {
    imgSources.push(r2CspDomain);
    mediaSources.push(r2CspDomain);
  }

  // Middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: imgSources,
        mediaSrc: mediaSources,
        connectSrc: ["'self'", ...wsOrigins, ...allowedOrigins],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(cors({
    origin: allowedOrigins,
    credentials: true
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Rate limiting
  app.use('/api', apiLimiter);

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
  app.use('/api/workspace-import', workspaceImportRoutes);
  app.use('/api/admin', adminRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global error handler (must be after all routes)
  app.use((err, req, res, next) => {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
