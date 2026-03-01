# BandChat

A real-time communication and management app for bands. Think Slack, but built specifically for musicians.

## Features

### Communication
- **Channels** — Organized chat rooms with channel groups and drag-and-drop reordering
- **Direct Messages** — Private 1-on-1 and group conversations
- **Threads** — Reply to specific messages in-line
- **Reactions** — Emoji reactions on messages
- **File Sharing** — Upload images and files up to 10MB via Cloudinary
- **Link Previews** — Automatic rich previews for shared URLs
- **Search** — Full-text search across all channels and messages
- **Push Notifications** — Web push for mentions, DMs, and replies
- **Announcements** — Pin important messages for the whole workspace
- **Polls** — Create polls for band decisions

### Band Management
- **Songs** — Track your repertoire with title, artist, key, BPM, duration, YouTube/Spotify links, notes, and bulk import with metadata enrichment
- **Setlists** — Drag-and-drop song ordering with automatic duration calculation and MC sections
- **Medleys** — Group songs into medleys within setlists
- **Calendar** — Schedule gigs, rehearsals, and recording sessions with venue, address, pay tracking, and device calendar sync
- **Gig Management** — Track attendance, mark gigs complete, view gig history
- **Stats** — Gigs played, total revenue, most played songs, songs never performed, band achievements
- **Band Members** — Timeline of current, former, and guest musicians with instrument tracking
- **Availability** — Members can mark their availability for upcoming dates
- **Contacts** — Shared contact list for venues, promoters, engineers, etc.
- **Band Kitty** — Shared band finances tracking
- **Recordings** — Track recordings linked to songs
- **Timeline** — Band history timeline with milestones and achievements

### User & Workspace Features
- **Google Sign-In** — Quick authentication with Google OAuth
- **Email/Password Auth** — Traditional signup with email verification
- **Password Reset** — Forgot password flow via email
- **Profile Customization** — Display name, avatar, bio
- **Multiple Workspaces** — Create and join multiple band workspaces
- **Workspace Onboarding** — Guided wizard for new workspaces (name, channels, invites, Slack import)
- **Role-Based Access** — Admin and member roles
- **Workspace Settings** — Theme customization (20+ themes, dark/light mode), leave/delete workspace
- **Slack Import** — Import channels, messages, threads, reactions, and gigs from a Slack export
- **Data Export** — Export user data or full workspace data as JSON
- **Account Deletion** — GDPR-compliant account deletion with data anonymization
- **Content Reporting** — Report objectionable messages (sent to admin via email)
- **User Blocking** — Block users to hide their messages from your view
- **Privacy Policy & Terms** — Accessible at /privacy and /terms

## Platforms

### Web Client
React single-page app deployed as a static site.

### Mobile App (iOS & Android)
Native mobile app built with Expo/React Native. 50+ screens covering all features including offline support, haptic feedback, and push notifications.

See `mobile/ROADMAP.md` for detailed feature breakdown.

## Tech Stack

### Client (Web)
- React 18 with React Router
- Vite 6
- Tailwind CSS
- Socket.IO Client
- Google OAuth (`@react-oauth/google`)

### Mobile
- Expo SDK ~54 / React Native
- React Navigation (native-stack)
- Expo modules: Calendar, Contacts, Haptics, Notifications, Image Picker
- EAS Build for iOS/Android

### Server
- Node.js / Express 4
- Prisma ORM with PostgreSQL
- Socket.IO (real-time messaging)
- JWT Authentication (access + refresh tokens)
- Cloudinary (image/file uploads)
- Web Push (VAPID)
- Resend (transactional email)

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
RESEND_API_KEY=your-resend-key
```

### Client (`client/.env`)
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_VAPID_PUBLIC_KEY=your-vapid-public
```

### Mobile (`mobile/.env`)
```
EXPO_PUBLIC_API_URL=https://your-server.railway.app/api
EXPO_PUBLIC_SOCKET_URL=https://your-server.railway.app
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

## Development

### Prerequisites
- Node.js 18+
- PostgreSQL database
- (Mobile) Expo CLI, EAS CLI

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ../mobile && npm install   # Optional, for mobile dev
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

   # Terminal 3 - Mobile (optional)
   cd mobile && npx expo start
   ```

## Project Structure

```
bandchat/
├── client/                 # React web frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/       # Login, Signup, Google Sign-In, Password Reset
│   │   │   ├── band/       # Songs, Setlists, Calendar, Stats, Members
│   │   │   ├── channels/   # Sidebar, ChannelView, ChannelMembersPanel
│   │   │   ├── common/     # Shared components (MemberProfile, ConfirmDialog, etc.)
│   │   │   ├── messages/   # MessageList, MessageInput, LinkPreviewCard
│   │   │   ├── threads/    # ThreadView
│   │   │   └── workspaces/ # WorkspaceList, WorkspaceView, SlackImportWizard
│   │   ├── context/        # AuthContext, SocketContext, ThemeContext, ToastContext
│   │   ├── hooks/          # Custom hooks (useLongPress, etc.)
│   │   ├── services/       # API client, Push service, Haptic service
│   │   └── styles/         # Tailwind CSS
│   └── package.json
├── mobile/                 # Expo/React Native mobile app
│   ├── src/
│   │   ├── screens/        # 50+ screens organized by feature
│   │   ├── components/     # Shared mobile components
│   │   ├── context/        # Auth, Socket, Theme, Toast contexts
│   │   ├── services/       # API client (~1200 lines)
│   │   └── utils/          # Haptics, helpers
│   ├── app.config.js       # Expo configuration
│   ├── eas.json            # EAS Build profiles
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # 23 route modules
│   │   ├── middleware/      # Auth, rate limiting
│   │   ├── services/       # Slack text converter, emoji map
│   │   ├── socket/         # Real-time event handlers
│   │   ├── scripts/        # CLI utilities
│   │   └── lib/            # Prisma client
│   ├── prisma/
│   │   └── schema.prisma   # Database schema (30+ models)
│   └── package.json
├── CLAUDE.md               # AI assistant instructions
└── README.md
```

## Deployment

Deployed on Railway with automatic deploys from the `main` branch:
1. **PostgreSQL** — Database service
2. **Server** — Node.js service (Express API + Socket.IO)
3. **Client** — Static site (Vite build)

Mobile app builds via EAS Build (Expo Application Services).

## License

Private - All rights reserved.
