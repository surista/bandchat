# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

BandChat is a real-time communication and management app for bands - like Slack, but built specifically for musicians. It features channels, direct messages, song/setlist management, calendar scheduling, push notifications, and a native mobile app.

## Build Commands

### Client (React frontend)
```bash
cd client
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run bump:patch   # Increment patch version
```

### Server (Express backend)
```bash
cd server
npm run dev          # Start with nodemon (hot reload, port 3001)
npm run start        # Production start (with db push)
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

### Mobile (Expo/React Native)
```bash
cd mobile
npx expo start       # Start Expo dev server
npx expo start --ios # iOS simulator
npx expo start --android # Android emulator
eas build --platform ios --profile preview  # Build iOS preview
eas build --platform android --profile preview  # Build Android preview
```

## Code Architecture

### Project Structure
```
bandchat/
├── client/                 # React web frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/       # Login, Signup, Google Sign-In, Password Reset
│   │   │   ├── band/       # Songs, Setlists, Calendar, Stats, Members
│   │   │   ├── channels/   # Sidebar, ChannelView, ChannelMembersPanel
│   │   │   ├── common/     # MemberProfile, ConfirmDialog, Skeleton, etc.
│   │   │   ├── messages/   # MessageList, MessageInput, LinkPreviewCard
│   │   │   ├── threads/    # ThreadView
│   │   │   └── workspaces/ # WorkspaceList, WorkspaceView, SlackImportWizard
│   │   ├── context/        # AuthContext, SocketContext, ThemeContext, ToastContext
│   │   ├── hooks/          # useLongPress, etc.
│   │   ├── services/       # API client, Push service, Haptic service
│   │   └── styles/         # Tailwind CSS
│   └── package.json
├── mobile/                 # Expo/React Native mobile app
│   ├── src/
│   │   ├── screens/        # 50+ screens organized by feature
│   │   ├── components/     # Shared mobile components
│   │   ├── context/        # Auth, Socket, Theme, Toast contexts
│   │   ├── services/       # API client (~1400 lines)
│   │   └── utils/          # Haptics, helpers
│   ├── app.config.js       # Expo config with permissions
│   ├── eas.json            # EAS Build profiles (dev/preview/production)
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # 23 route modules (auth, channels, messages, songs, etc.)
│   │   ├── middleware/      # Auth (JWT), rate limiting
│   │   ├── services/       # Slack text converter, emoji map
│   │   ├── socket/         # Real-time event handlers
│   │   ├── scripts/        # CLI utilities (import-slack, etc.)
│   │   └── lib/            # Prisma client singleton
│   ├── prisma/
│   │   └── schema.prisma   # Database schema (30+ models)
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

**Mobile:**
- Expo SDK ~54 / React Native
- React Navigation (native-stack)
- Expo Calendar, Contacts, Haptics, Notifications, Image Picker

**Server:**
- Express 4
- Prisma ORM with PostgreSQL (30+ models)
- Socket.IO (real-time)
- JWT Authentication (access tokens + httpOnly cookie refresh tokens)
- Cloudinary (image/file uploads with magic byte validation)
- Web Push Notifications (VAPID)
- Resend (transactional email)
- cookie-parser, Helmet + CSP, rate limiting

### Key Features
- Real-time messaging with channels, DMs, threads, reactions, and voice messages
- File/image/audio sharing (up to 10MB) with link previews and photo gallery
- Song repertoire with bulk import, async metadata enrichment, and lyrics
- Drag-and-drop setlist builder with MC sections, medleys, and PDF export
- Calendar for gigs/rehearsals with device calendar sync and iCal feed
- Gig attendance tracking, completion, history, and live mode
- Practice tracker with streaks and timezone-aware calculations
- Band member timeline, availability, and achievements
- Band kitty (shared finances), contacts, announcements (with expiry), polls
- Slack workspace import (channels, messages, threads, reactions, gigs)
- Push notifications, 20+ themes, dark/light mode, system theme sync
- Account deletion, data export, workspace export
- Leave workspace, delete workspace
- Onboarding wizard for new workspaces

### Server Routes (25 modules)
auth, channels, channelGroups, messages, workspaces, songs, setlists, gigs, bandMembers, availability, contacts, announcements, polls, timeline, achievements, recordings, medleys, kitty, uploads, push, linkPreview, suggestions, slackImport, practice, reports

## Environment Variables

See README.md for full list. Required:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `CLOUDINARY_*` - Image upload config
- `VAPID_*` - Push notification keys
- `GOOGLE_CLIENT_ID`
- `RESEND_API_KEY` - Transactional email

## Deployment

Deployed on Railway with automatic deploys from main branch:
1. PostgreSQL database service
2. Server as Node.js service
3. Client as static site

Mobile app: EAS Build (Expo Application Services) for iOS/Android.

## Git Commit Rules

- NEVER add "Co-Authored-By" lines to commits
- Keep commit messages short and descriptive

## Development Notes

- CSS should go in `/client/styles/` CSS files
- JavaScript code in `/client/src/` and `/server/src/`
- The Sidebar.jsx component is large (~1300 lines) — contains channel management and workspace UI (settings moved to SettingsModal.jsx)
- Database uses cascade deletes on workspace relations

## Web + Mobile Parity

**IMPORTANT:** The web client (`client/`) and mobile app (`mobile/`) are parallel frontends for the same backend. When making changes, ALWAYS consider whether the change applies to both platforms:

- **UI features** (show/hide password, footer links, currency formatting, etc.) — apply to BOTH web and mobile
- **Bug fixes** in display logic, formatting, or data handling — check BOTH platforms for the same issue
- **New API fields** returned by the server — update BOTH web and mobile to use them
- **Server-side changes** (new endpoints, response shape changes) — update BOTH clients that consume them

Before marking a task as complete, ask yourself: "Does the other platform need this change too?" If the answer is yes or maybe, apply it to both in the same commit.

## Platform-Specific Features

While most features should exist on both web and mobile, some features make sense on only one platform due to device capabilities or use context.

### Desktop/Web Only
These features work better with a keyboard, mouse, or larger screen:

| Feature | Rationale | Mobile Hint |
|---------|-----------|-------------|
| **Audio Analyzer** | CPU-intensive WASM (Essentia.js), needs file system access | SongDetailScreen shows hint |
| **Slack Import Wizard** | One-time admin task, requires uploading large ZIP files | SettingsScreen shows hint |

### Mobile Only
These features leverage native device capabilities:

| Feature | Rationale |
|---------|-----------|
| **Live Mode** (optimized) | Primary use case is on-stage with phone in hand |
| **Add gig to device calendar** | Native calendar integration via Expo Calendar |
| **Camera for gig photos** | Direct capture vs upload |
| **Haptic feedback** | Touch-specific feedback |
| **Gig gallery** | Browse and manage gig photos |
| **Message reporting** | Report objectionable content |
| **Print & Share setlists** | expo-print integration |
| **Offline detection banner** | More relevant for mobile connectivity |

### Both Platforms (Core Features)
All communication and reference features work on both:

- Messaging, channels, threads, reactions
- Song list, bulk import, metadata enrichment
- Setlists, setlist performers, live mode
- Gigs, calendar, cross-workspace view
- Members, contacts, polls, announcements
- Settings, profile, themes, data export
- Push notifications, Practice Dashboard

### Feature Parity Summary (March 2026)

| Area | Parity | Notes |
|------|--------|-------|
| Messaging | 95% | Mobile missing: pinned messages panel, link previews |
| Songs | 90% | Web has Song Suggestions; both have bulk import |
| Setlists | 85% | Web has advanced drag-drop; mobile has print/share |
| Gigs/Calendar | 90% | Web has month view; mobile has iCal subscribe |
| Members | 95% | Excellent parity |
| Settings | 85% | Mobile has more granular security options |

### Implementation Notes
- Desktop-only features show hints on mobile directing users to the web app
- Mobile-only features are documented in `mobile/ROADMAP.md`
- Core features added to one platform should be added to the other in the same PR when possible

## Empty State Guidelines

Empty states should be helpful and actionable. Follow this pattern:

```jsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="text-5xl mb-4">{emoji}</div>
  <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
    {title}
  </h3>
  <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
    {helpfulDescription}
  </p>
  <button className="btn bg-green-600 hover:bg-green-700 text-white">
    + {actionLabel}
  </button>
</div>
```

- Include a relevant emoji icon
- Use a clear title ("No songs yet" not just "Empty")
- Provide a helpful description explaining the feature's purpose
- Include an action button when the user can create content
