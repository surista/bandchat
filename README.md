# BandChat

A real-time communication and management app for bands. Think Slack, but built specifically for musicians.

## Features

### Communication
- **Channels** - Organized chat rooms with channel groups
- **Direct Messages** - Private conversations between members
- **Threads** - Reply to specific messages
- **Reactions** - Emoji reactions on messages
- **File Sharing** - Upload images up to 10MB
- **Search** - Find messages across all channels
- **Push Notifications** - Stay updated on mobile/desktop

### Band Management
- **Songs** - Track your repertoire with title, artist, key, BPM, duration, YouTube/Spotify links, and notes
- **Setlists** - Drag-and-drop song ordering with automatic duration calculation
- **Calendar** - Schedule gigs, rehearsals, and recording sessions with venue, address, and pay tracking
- **Stats** - View gigs played, total revenue, most played songs, and songs never performed

### User Features
- **Google Sign-In** - Quick authentication with Google
- **Profile Customization** - Upload avatar photos (max 10MB)
- **Workspace Management** - Create/join multiple band workspaces
- **Role-Based Access** - Admin and member roles

## Tech Stack

### Client
- React 18
- React Router
- Socket.IO Client
- Tailwind CSS
- Vite

### Server
- Node.js / Express
- Prisma ORM
- PostgreSQL
- Socket.IO
- JWT Authentication
- Cloudinary (image uploads)
- Web Push Notifications

## Environment Variables

### Server (`server/.env`)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_UPLOAD_PRESET=your-preset
VAPID_PUBLIC_KEY=your-vapid-public
VAPID_PRIVATE_KEY=your-vapid-private
VAPID_EMAIL=mailto:your@email.com
GOOGLE_CLIENT_ID=your-google-client-id
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_VAPID_PUBLIC_KEY=your-vapid-public
```

## Development

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
3. Set up environment variables (see above)
4. Run database migrations:
   ```bash
   cd server && npx prisma db push
   ```
5. Start the development servers:
   ```bash
   # Terminal 1 - Server
   cd server && npm run dev

   # Terminal 2 - Client
   cd client && npm run dev
   ```

## Deployment

The app is configured for deployment on Railway with automatic deploys from the main branch.

### Railway Setup
1. Create a new project with PostgreSQL
2. Add the server as a service
3. Add the client as a static site
4. Configure environment variables
5. Deploy!

## Project Structure

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
│   │   └── styles/         # CSS
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

## License

Private - All rights reserved.
