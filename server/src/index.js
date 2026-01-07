import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import pushRoutes from './routes/push.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { apiLimiter } from './middleware/rateLimit.js';

dotenv.config();

const app = express();
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

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Rate limiting
app.use('/api', apiLimiter);

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/push', pushRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
