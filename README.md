# BandChat

A real-time communication and management app for bands. Think Slack, but built specifically for musicians.

## Features

### Communication
- **Channels** — Organized chat rooms with channel groups and drag-and-drop reordering
- **Direct Messages** — Private 1-on-1 and group conversations
- **Threads** — Reply to specific messages in-line
- **Reactions** — Emoji reactions on messages
- **File Sharing** — Upload images (15MB, iPhone HEIC photos transcoded to JPEG on-device), audio (30MB), video (50MB), PDFs, Guitar Pro, and ZIPs via Cloudflare R2 with auto-generated thumbnails. Up to 5 attachments per message.
- **Voice Messages** — Record and send audio messages
- **Link Previews** — Automatic rich previews for shared URLs (dismissible by author, with SSRF protection)
- **Search** — Full-text search across all channels, DMs, and messages (trigram index)
- **Push Notifications** — Web push for mentions, DMs, and replies
- **Quick Reactions** — Fast emoji reactions on messages
- **Saved Messages** — Bookmark messages privately for quick reference later
- **Seen By** — See who has read your messages
- **Announcements** — Pin important messages with optional expiry and acknowledgment tracking
- **Polls** — Create polls for band decisions
- **Photo Gallery** — Browse all shared images in a channel

### Band Management
- **Songs** — Track your repertoire with title, artist, key, BPM, duration, lyrics, YouTube/Spotify links, notes, and bulk import with async metadata enrichment (iTunes, Spotify, Deezer, YouTube, SongBPM)
- **Setlists** — Drag-and-drop song ordering with automatic duration calculation, MC sections, set breaks, and PDF export
- **Stage Plots** — Drag-and-drop stage layout editor with 20+ equipment icons, text labels, and print/PDF export
- **Medleys** — Group songs into medleys within setlists
- **Calendar** — Schedule gigs, rehearsals, and recording sessions with venue, address, pay tracking, device calendar sync, iCal feed, and optional time fields (sound check, doors, stage time)
- **Event Comments** — Discuss a specific event inline. Authors can edit their own comments; authors and workspace admins can delete. Comment count surfaces on calendar rows, list cards, and the upcoming-event banner. Real-time via Socket.IO with push notifications. Personal events restrict comment visibility to creator + admins.
- **Upcoming Event Banner** — Next gig/rehearsal always visible at the top of the sidebar with pinned Calendar shortcut
- **Gig Management** — Track attendance, mark gigs complete, view gig history, live mode during performances
- **Gig Gallery** — Photo/video collection per gig
- **Practice Dashboard** — Log practice sessions, track streaks and total time, view history grouped by date
- **Stats** — Gigs played, total revenue, most played songs, songs never performed, band achievements
- **Band Members** — Timeline of current, former, and guest musicians with instrument tracking
- **Availability** — Members can mark their availability for upcoming dates
- **Contacts** — Shared contact list for venues, promoters, engineers, etc.
- **Band Kitty** — Shared band finances tracking (gig pay, expenses, fees)
- **Recordings** — Track recordings linked to songs
- **Timeline** — Band history timeline with milestones and achievements

### User & Workspace Features
- **Google Sign-In** — Quick authentication with Google OAuth
- **Email/Password Auth** — Traditional signup with email verification and password complexity enforcement
- **Password Reset** — Forgot password flow via email
- **Profile Customization** — Display name, avatar, bio
- **Multiple Workspaces** — Create and join multiple band workspaces
- **Workspace Onboarding** — Guided wizard for new workspaces (name, channels, invites, Slack import)
- **Role-Based Access** — Admin and member roles with auto-elevation
- **Workspace Settings** — Theme customization (20+ themes, dark/light mode, system theme sync), leave/delete workspace
- **Notification Controls** — Per-workspace preferences, snooze notifications
- **Slack Import** — Import channels, messages, threads, reactions, and gigs from a Slack export
- **Data Export** — Export user data or full workspace data as JSON
- **Account Deletion** — Soft-delete with 30-day grace period, then GDPR-compliant data anonymization
- **Content Reporting** — Report objectionable messages (sent to admin via email)
- **User Blocking** — Block users to hide their messages from your view
- **Privacy Policy & Terms** — Accessible at /privacy and /terms

### Subscriptions
- **Per-workspace plans** — FREE and PRO tiers with configurable limits
- **RevenueCat** — In-app purchases on iOS/Android (monthly, annual, lifetime)
- **Plan enforcement** — Storage, member, song, and feature limits per plan

### Admin Dashboard (`/admin`)
- **Overview** — Platform stats with 7d/30d trends
- **Users** — Search, detail view, toggle system admin
- **Workspaces** — Search with member/channel/message/storage counts
- **Storage** — R2 stats, orphan scan and cleanup, per-workspace usage, recalculate
- **Backups** — Daily automated backups to R2 with verification, manual trigger, download, restore with safety backup
- **Deleted Items** — Soft-deleted users/workspaces with restore and permanent purge

## Platforms

### Web Client
React single-page app deployed as a static site on Vercel. 64 components across 9 directories.

### Mobile App (iOS & Android)
Native mobile app built with Expo/React Native. 55 screens and 18 shared components covering all features including offline support, haptic feedback, push notifications, swipe gestures (reply/react), Gig Archive, and app icon quick actions.

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
- RevenueCat (`react-native-purchases`) for in-app subscriptions
- EAS Build for iOS/Android

### Server
- Node.js / Express 4
- Prisma ORM with PostgreSQL (45 models, 8 enums)
- Socket.IO (real-time messaging)
- JWT Authentication (access tokens + httpOnly cookie refresh tokens with rotation and reuse detection)
- Cloudflare R2 (file uploads with magic byte validation, MIME-based extensions, server-side thumbnails via Sharp)
- Web Push (VAPID)
- Resend (transactional email)
- RevenueCat (subscription management)
- Helmet + CSP, per-route rate limiting, SSRF protection on link previews
- JWT secret strength validation at startup
- Socket.IO hardening (payload validation, connection limits, room eviction)
- Prisma middleware for soft-delete auto-filtering
- Background jobs: token cleanup (hourly), database backup (daily), soft-delete purge (daily)

## Environment Variables

### Server (`server/.env`)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
CLIENT_URL=http://localhost:5173
R2_ACCOUNT_ID=your-r2-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-r2-bucket
R2_PUBLIC_URL=https://your-r2-public-url
VAPID_PUBLIC_KEY=your-vapid-public
VAPID_PRIVATE_KEY=your-vapid-private
VAPID_EMAIL=mailto:your@email.com
GOOGLE_CLIENT_ID=your-google-client-id
RESEND_API_KEY=your-resend-key
REVENUECAT_SECRET_KEY=your-revenuecat-key
REVENUECAT_WEBHOOK_SECRET=your-webhook-secret
```

Legacy (still accepted for existing URLs): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`

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
├── client/                     # React web frontend
│   ├── src/
│   │   ├── components/         # 64 components across 9 subdirectories
│   │   │   ├── auth/           # 6 components: Login, Signup, OAuth, Password Reset
│   │   │   ├── band/           # 22 components: Songs, Setlists, Calendar, Stats, etc.
│   │   │   ├── channels/       # 6 components: Sidebar, ChannelView, Settings, etc.
│   │   │   ├── common/         # 12 shared components
│   │   │   ├── legal/          # 3 components: Privacy, Terms, Support
│   │   │   ├── messages/       # 6 components: MessageList, Input, Reactions, etc.
│   │   │   ├── navigation/     # MobileNav
│   │   │   ├── threads/        # ThreadView
│   │   │   └── workspaces/     # 6 components: List, View, Import, Onboarding
│   │   ├── context/            # 4 contexts: Auth, Socket, Theme, Toast
│   │   ├── hooks/              # 3 hooks: useLongPress, useOnlineStatus, useSwipeGesture
│   │   ├── services/           # 7 services: api, badge, haptic, push, platform, etc.
│   │   └── styles/             # Tailwind CSS
│   └── package.json
├── mobile/                     # Expo/React Native mobile app
│   ├── src/
│   │   ├── screens/            # 55 screens
│   │   ├── components/         # 18 shared components
│   │   ├── context/            # 4 contexts: Auth, Socket, Theme, Toast
│   │   ├── services/           # ApiService (~1400 lines)
│   │   └── utils/              # 9 utilities
│   ├── app.config.js           # Expo configuration
│   ├── eas.json                # EAS Build profiles
│   └── package.json
├── server/                     # Express backend
│   ├── src/
│   │   ├── routes/             # 29 route modules
│   │   ├── middleware/         # 3 modules: auth, rateLimit, requestId
│   │   ├── admin/              # Standalone admin dashboard (HTML/CSS/JS)
│   │   ├── services/           # 8 services: backup, metadata enrichment, Slack conversion
│   │   ├── socket/             # Real-time event handlers
│   │   ├── scripts/            # 6 CLI utilities
│   │   └── lib/                # 7 modules: prisma, storage, validators, planLimits, etc.
│   ├── prisma/
│   │   └── schema.prisma       # 45 models, 8 enums
│   └── package.json
├── CLAUDE.md                   # AI assistant instructions
├── CHANGELOG.md                # Version history
└── README.md                   # This file
```

## Deployment

- **Server**: Railway (Node.js service, auto-deploys from `main`)
- **Client**: Vercel (static site, auto-deploys from `main`)
- **Database**: Railway PostgreSQL
- **Mobile**: EAS Build (Expo Application Services) for iOS TestFlight / Android

## License

Private - All rights reserved.
