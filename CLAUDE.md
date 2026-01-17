# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

BandChat is a real-time communication and management app for bands - like Slack, but built specifically for musicians. It features channels, direct messages, song/setlist management, calendar scheduling, and push notifications.

## Build Commands

### Client (React frontend)
```bash
cd client
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run bump:patch   # Increment patch version
```

### Server (Express backend)
```bash
cd server
npm run dev          # Start with nodemon (hot reload)
npm run start        # Production start (with db push)
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

## Code Architecture

### Project Structure
```
bandchat/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/       # Login, Signup, Google Sign-In
│   │   │   ├── band/       # Songs, Setlists, Calendar, Stats
│   │   │   ├── channels/   # Sidebar, ChannelView
│   │   │   ├── messages/   # MessageList, MessageInput
│   │   │   └── workspaces/ # WorkspaceList, WorkspaceView
│   │   ├── context/        # Auth, Socket providers
│   │   ├── services/       # API client, Push service
│   │   └── styles/         # Tailwind CSS
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth, rate limiting
│   │   ├── socket/         # Real-time handlers
│   │   └── lib/            # Prisma client
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── package.json
└── README.md
```

### Tech Stack

**Client:**
- React 18 with React Router
- Vite 6 (build tool)
- Tailwind CSS
- Socket.IO Client
- Google OAuth

**Server:**
- Express 4
- Prisma ORM with PostgreSQL
- Socket.IO
- JWT Authentication
- Cloudinary (image uploads)
- Web Push Notifications
- Resend (email)

### Key Features
- Real-time messaging with channels and DMs
- Thread replies and emoji reactions
- File/image sharing (up to 10MB)
- Song repertoire management
- Drag-and-drop setlist builder
- Calendar for gigs/rehearsals
- Push notifications
- Google Sign-In

## Environment Variables

See README.md for full list. Required:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `CLOUDINARY_*` - Image upload config
- `VAPID_*` - Push notification keys
- `GOOGLE_CLIENT_ID`

## Deployment

Configured for Railway with automatic deploys from main branch:
1. PostgreSQL database service
2. Server as Node.js service
3. Client as static site

## Development Plan

<!-- Add planned features and tasks here -->
