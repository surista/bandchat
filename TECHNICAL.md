# BandChat Technical Documentation

Comprehensive technical reference for the BandChat platform — a real-time communication and management app for bands.

**Version:** v1.04.59
**Last updated:** March 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Deployment](#deployment)
4. [Environment Variables](#environment-variables)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [WebSocket Events](#websocket-events)
8. [Authentication & Security](#authentication--security)
9. [Third-Party Services](#third-party-services)
10. [Client Architecture](#client-architecture)
11. [Mobile App Architecture](#mobile-app-architecture)

---

## Architecture Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Web Client  │    │  Mobile App  │    │   Browser    │
│   (React)    │    │   (Expo)     │    │  Push API    │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │  HTTPS / WSS      │  HTTPS / WSS      │  Web Push
       │                   │                   │
┌──────▼───────────────────▼───────────────────▼───────┐
│                   Express Server                      │
│  ┌─────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │ REST API │  │ Socket.IO │  │ Push Notifications │ │
│  │ 29 route │  │  Real-time│  │     (VAPID)        │ │
│  │ modules  │  │  events   │  │                    │ │
│  └────┬─────┘  └─────┬─────┘  └────────────────────┘ │
│       │              │                                │
│  ┌────▼──────────────▼──────┐                        │
│  │    Prisma ORM            │                        │
│  │    45 models             │                        │
│  └────┬─────────────────────┘                        │
└───────┼──────────────────────────────────────────────┘
        │
┌───────▼──────┐   ┌───────────┐   ┌──────────┐
│  PostgreSQL  │   │ Cloudinary│   │  Resend  │
│  (Railway)   │   │ (uploads) │   │ (email)  │
└──────────────┘   └───────────┘   └──────────┘
```

---

## Tech Stack

### Server
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 22.x | Runtime |
| Express | 4.21.1 | HTTP framework |
| Prisma | 5.22.0 | ORM / database client |
| Socket.IO | 4.8.1 | Real-time messaging |
| jsonwebtoken | 9.0.2 | JWT auth tokens |
| bcryptjs | 2.4.3 | Password hashing |
| helmet | 8.1.0 | HTTP security headers |
| express-rate-limit | 7.4.1 | Request throttling |
| web-push | 3.6.7 | Push notifications (VAPID) |
| Resend | 4.0.0 | Transactional email |
| Cloudinary | 2.8.0 | File/image hosting |
| google-auth-library | 10.5.0 | Google OAuth verification |
| multer | 2.0.2 | File upload handling |

### Web Client
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| React Router | 6.28.0 | Client-side routing |
| Vite | 6.0.1 | Build tool / dev server |
| Tailwind CSS | 3.4.15 | Utility-first CSS |
| Socket.IO Client | 4.8.1 | Real-time connection |
| date-fns | 4.1.0 | Date formatting |
| @react-oauth/google | 0.13.4 | Google Sign-In button |

### Mobile App
| Technology | Version | Purpose |
|---|---|---|
| React Native | 0.77.1 | Mobile framework |
| Expo SDK | ~54 | Build toolchain / native APIs |
| React Navigation | 7.1.6 | Screen navigation |
| Socket.IO Client | 4.8.3 | Real-time connection |
| Expo Notifications | - | Push notifications |
| Expo Calendar | - | Device calendar sync |
| Expo Image Picker | - | Camera / photo library |
| Expo Haptics | - | Haptic feedback |
| Expo Secure Store | - | Encrypted token storage |

### Database
| Technology | Purpose |
|---|---|
| PostgreSQL | Primary database (hosted on Railway) |
| 45 Prisma models | Full schema with relations, indexes, enums |

---

## Deployment

**Platform:** Railway (auto-deploys from `main` branch)

| Service | Type | Details |
|---|---|---|
| PostgreSQL | Database | Railway-managed, connection pooling via `?connection_limit=5` |
| Server | Node.js service | Express API + Socket.IO on single port |
| Client | Static site | Vite production build |

**Server start command:**
```
prisma generate && prisma db push && node src/index.js
```

**Domain:** `bandchat.app` (registered via Namecheap)

**Mobile builds:** EAS Build (Expo Application Services)
- `eas.json` profiles: development, preview, production
- Bundle ID: `com.bandchat.mobile` (iOS & Android)

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Access token signing key |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing key |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | `development` or `production` |
| `CLIENT_URL` | Yes | Frontend URL(s), comma-separated |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_PRESET` | Yes | Cloudinary unsigned upload preset |
| `VAPID_PUBLIC_KEY` | Yes | Web push public key |
| `VAPID_PRIVATE_KEY` | Yes | Web push private key |
| `VAPID_EMAIL` | No | VAPID contact email (default: `admin@bandchat.app`) |
| `RESEND_API_KEY` | No | Resend email API key (emails logged to console if missing) |
| `RESEND_DOMAIN` | No | Resend verified domain (default: `resend.dev`) |
| `EMAIL_FROM` | No | From address for emails (default: `BandChat <noreply@bandchat.app>`) |
| `ADMIN_EMAIL` | No | Recipient for content reports (default: `admin@bandchat.app`) |
| `YOUTUBE_API_KEY` | No | YouTube Data API for song metadata enrichment |

### Client (`client/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Server API base URL |
| `VITE_SOCKET_URL` | Yes | Server Socket.IO URL |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `VITE_VAPID_PUBLIC_KEY` | Yes | Web push public key |

### Mobile (`mobile/.env`)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Yes | Server API base URL |
| `EXPO_PUBLIC_SOCKET_URL` | Yes | Server Socket.IO URL |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |

---

## Database Schema

### Enums

| Enum | Values |
|---|---|
| `Role` | `ADMIN`, `MEMBER` |
| `AttachmentType` | `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `LINK` |
| `SetlistSongType` | `SONG`, `MC`, `SET_BREAK` |
| `GigType` | `GIG`, `REHEARSAL`, `RECORDING`, `OTHER` |
| `GigStatus` | `SCHEDULED`, `COMPLETED`, `CANCELLED` |
| `AttendeeStatus` | `ATTENDING`, `NOT_ATTENDING`, `MAYBE` |
| `AvailabilityStatus` | `AVAILABLE`, `UNAVAILABLE`, `MAYBE` |
| `KittyTransactionType` | `GIG_PAY`, `FEE`, `EXPENSE`, `OTHER_INCOME` |

### Models (45 total)

#### Core

| Model | Key Fields | Relations |
|---|---|---|
| **User** | id, email, password?, displayName, avatarUrl?, bio?, googleId?, authProvider, emailVerified | workspaces, messages, reactions, songs, setlists, gigs, reportsMade, blocksInitiated, blocksReceived |
| **RefreshToken** | id, token (unique, hashed), userId, expiresAt | user |
| **Workspace** | id, name, inviteCode (unique), inviteCodeExpiresAt?, inviteMaxUses?, inviteUsedCount | members, channels, channelGroups, songs, setlists, gigs, bandKitty |
| **WorkspaceMember** | userId+workspaceId (composite PK), role (ADMIN/MEMBER), joinedAt | user, workspace |

#### Messaging

| Model | Key Fields | Relations |
|---|---|---|
| **Channel** | id, name, description?, isPrivate, isDirect, workspaceId, groupId?, position | workspace, group, members, messages, polls, pinnedMessages |
| **ChannelGroup** | id, name, position, isCollapsed, workspaceId | workspace, channels |
| **ChannelMember** | userId+channelId (composite PK), muted, lastRead, joinedAt | user, channel |
| **Message** | id, content, authorId?, channelId, parentId?, isHidden, removedUserName? | author, channel, parent, replies, attachments, reactions, threadReads, pinnedMessages, reports |
| **Attachment** | id, messageId, type (IMAGE/VIDEO/AUDIO/DOCUMENT/LINK), url, filename, size? | message |
| **Reaction** | id, emoji, userId, messageId | user, message. Unique(userId, messageId, emoji) |
| **ThreadRead** | userId+messageId (composite PK), lastRead | user, message |
| **PinnedMessage** | id, messageId, channelId, pinnedById? | message, channel, pinnedBy |
| **PushSubscription** | id, userId, endpoint (unique), p256dh, auth | user |

#### Band Management

| Model | Key Fields | Relations |
|---|---|---|
| **Song** | id, title, shortName?, artist?, duration?, key?, bpm?, notes?, lyrics?, youtubeUrl?, spotifyUrl?, workspaceId | workspace, setlistSongs, gigSongs, attachments, medleySongs, recordings. Unique(workspaceId, title, artist) |
| **SongAttachment** | id, songId, filename, url, type, size? | song |
| **Setlist** | id, name, description?, useShortNames, performedAt?, venue?, startTime?, workspaceId | workspace, songs, gigSetlists, performers. Unique(workspaceId, name) |
| **SetlistSong** | id, setlistId, songId?, position, type (SONG/MC/SET_BREAK), duration?, label? | setlist, song |
| **SetlistPerformer** | id, setlistId, bandMemberId | setlist, bandMember. Unique(setlistId, bandMemberId) |
| **Gig** | id, title, type (GIG/REHEARSAL/RECORDING/OTHER), date, endDate?, soundCheckTime?, eventStartTime?, performanceStartTime?, venue?, address?, notes?, pay?, status, isLocked, workspaceId | workspace, setlists, songsPlayed, media, attendees, kittyTransactions |
| **GigSetlist** | id, gigId, setlistId, setNumber | gig, setlist. Unique(gigId, setNumber) |
| **GigSong** | id, gigId, songId | gig, song. Unique(gigId, songId) |
| **GigMedia** | id, gigId, type, url, caption? | gig |
| **GigAttendee** | id, gigId, bandMemberId, status (ATTENDING/NOT_ATTENDING/MAYBE) | gig, bandMember. Unique(gigId, bandMemberId) |
| **BandMember** | id, name, imageUrl?, notes?, isGuest, linkedUserId?, workspaceId | workspace, linkedUser, stints, performances, gigAttendances |
| **InstrumentStint** | id, bandMemberId, instruments (string[]), startDate, endDate? | bandMember |
| **MemberAvailability** | id, userId, workspaceId, date, status (AVAILABLE/UNAVAILABLE/MAYBE), note? | user, workspace. Unique(userId, workspaceId, date) |
| **Medley** | id, name, description?, workspaceId | workspace, songs. Unique(workspaceId, name) |
| **MedleySong** | id, medleyId, songId, position | medley, song. Unique(medleyId, songId) |
| **Contact** | id, name, category, email?, phone?, website?, address?, notes?, workspaceId | workspace |
| **Recording** | id, title, description?, url, type (audio/video), duration?, songId?, workspaceId | song, workspace |

#### Social

| Model | Key Fields | Relations |
|---|---|---|
| **Announcement** | id, title, content, priority, isPinned, workspaceId, expiresAt? | workspace, acknowledgments |
| **AnnouncementAcknowledgment** | id, announcementId, userId, acknowledgedAt | announcement, user. Unique(announcementId, userId) |
| **Poll** | id, question, description?, allowMultiple, isAnonymous, isClosed, workspaceId, channelId? | workspace, channel, options |
| **PollOption** | id, pollId, text, position | poll, votes |
| **PollVote** | id, optionId, userId | option, user. Unique(optionId, userId) |
| **TimelineEvent** | id, title, description?, eventType, eventDate, imageUrl?, workspaceId | workspace |

#### Achievements

| Model | Key Fields | Relations |
|---|---|---|
| **Achievement** | id, code (unique), name, description, icon, category, threshold?, isBandWide | memberAchievements, bandAchievements |
| **MemberAchievement** | id, achievementId, userId, workspaceId, earnedAt, metadata? | achievement, user, workspace. Unique(achievementId, userId, workspaceId) |
| **BandAchievement** | id, achievementId, workspaceId, earnedAt, metadata? | achievement, workspace. Unique(achievementId, workspaceId) |

#### Financial

| Model | Key Fields | Relations |
|---|---|---|
| **BandKitty** | id, workspaceId (unique), startingBalance, balanceAsOfDate, currency | workspace, transactions |
| **KittyTransaction** | id, kittyId, type (GIG_PAY/FEE/EXPENSE/OTHER_INCOME), category?, amount, description, date, gigId? | kitty, gig |

#### Moderation

| Model | Key Fields | Relations |
|---|---|---|
| **Report** | id, reporterId, messageId, reason | reporter (User), message. Unique(reporterId, messageId) |
| **BlockedUser** | id, blockerId, blockedUserId | blocker (User), blockedUser (User). Unique(blockerId, blockedUserId) |

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/signup` | No | Register with email/password |
| POST | `/login` | No | Login, returns JWT tokens |
| POST | `/google` | No | Google OAuth sign-in/sign-up |
| POST | `/link-google` | Yes | Link Google account to existing user |
| POST | `/refresh` | No | Refresh access token |
| POST | `/verify-email` | No | Verify email with token |
| POST | `/resend-verification` | No | Resend verification email |
| POST | `/change-email` | Yes | Request email change |
| POST | `/verify-email-change` | No | Confirm new email |
| POST | `/forgot-password` | No | Request password reset email |
| POST | `/reset-password` | No | Reset password with token |
| GET | `/verify-reset-token` | No | Validate reset token |
| GET | `/me` | Yes | Get current user profile |
| PUT | `/me` | Yes | Update profile (displayName, avatarUrl, bio) |
| PUT | `/password` | Yes | Change password |
| POST | `/logout` | Yes | Logout, revoke refresh token |
| POST | `/logout-all` | Yes | Revoke all refresh tokens |
| DELETE | `/account` | Yes | Delete account, anonymize messages |
| GET | `/export` | Yes | Export all user data as JSON |

### Workspaces (`/api/workspaces`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | List user's workspaces |
| POST | `/` | Yes | Create workspace |
| GET | `/:id` | Member | Get workspace details |
| PUT | `/:id` | Admin | Update workspace |
| DELETE | `/:id` | Admin | Delete workspace |
| POST | `/:id/leave` | Member | Leave workspace |
| GET | `/:id/members` | Member | List members |
| PUT | `/:id/members/:userId` | Admin | Update member role/displayName |
| DELETE | `/:id/members/:userId` | Admin | Remove member |
| POST | `/:id/members/:userId/reset-password` | Admin | Reset member's password |
| GET | `/:id/members/:userId/profile` | Member | Get member profile with stats |
| GET | `/:id/members/:userId/events` | Member | Get member's gig/rehearsal history |
| GET | `/:id/invite-code` | Admin | Get current invite code |
| POST | `/:id/invite-code` | Admin | Regenerate invite code |
| POST | `/:id/invite-email` | Admin | Send email invitation |
| POST | `/join/:inviteCode` | Yes | Join workspace via invite code |
| GET | `/:id/stats` | Member | Workspace statistics |
| GET | `/:id/export` | Admin | Export workspace data as JSON |

### Channels (`/api/channels`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/workspace/:id` | Member | List channels |
| POST | `/workspace/:id` | Member | Create channel |
| GET | `/:channelId` | ChannelMember | Get channel details |
| PUT | `/:channelId` | ChannelMember | Update channel |
| DELETE | `/:channelId` | ChannelMember | Delete channel |
| POST | `/:channelId/members` | ChannelMember | Add member |
| DELETE | `/:channelId/members/:userId` | ChannelMember | Remove member |
| PUT | `/:channelId/mute` | ChannelMember | Mute/unmute |
| POST | `/:channelId/read` | ChannelMember | Mark as read |
| GET | `/workspace/:id/dms` | Member | List DMs |
| POST | `/workspace/:id/dm` | Member | Create or get DM |

### Channel Groups (`/api/channel-groups`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/workspace/:id` | Member | List groups |
| POST | `/workspace/:id` | Member | Create group |
| PUT | `/:groupId` | Member | Update group |
| DELETE | `/:groupId` | Member | Delete group |
| PUT | `/:groupId/channels/:channelId` | Member | Move channel to group |

### Messages (`/api/messages`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/channel/:channelId` | ChannelMember | Get messages (paginated, cursor-based) |
| POST | `/channel/:channelId` | ChannelMember | Create message (rate limited: 30/min) |
| PUT | `/:messageId` | Author | Edit message |
| DELETE | `/:messageId` | Author | Delete message |
| GET | `/:messageId/replies` | Yes | Get thread replies |
| POST | `/:messageId/reactions` | Yes | Add emoji reaction |
| DELETE | `/:messageId/reactions/:emoji` | Yes | Remove reaction |
| POST | `/:messageId/pin` | ChannelMember | Pin message |
| DELETE | `/:messageId/pin` | ChannelMember | Unpin message |
| GET | `/channel/:channelId/pins` | ChannelMember | Get pinned messages |
| POST | `/:messageId/thread-read` | Yes | Mark thread as read |
| GET | `/search/:workspaceId` | Member | Full-text search |

### Songs (`/api/songs`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/workspace/:id` | Member | List songs |
| POST | `/workspace/:id` | Member | Create song |
| GET | `/:songId` | Yes | Get song details |
| PUT | `/:songId` | Yes | Update song |
| DELETE | `/:songId` | Yes | Delete song |
| POST | `/workspace/:id/bulk` | Member | Bulk import songs |
| POST | `/workspace/:id/enrich` | Member | Enrich with BPM/key metadata |
| GET | `/metadata-status` | Yes | Check metadata service status |
| GET | `/:songId/attachments` | Yes | Get song attachments |
| POST | `/:songId/attachments` | Yes | Add attachment |
| DELETE | `/:songId/attachments/:id` | Yes | Delete attachment |

### Setlists (`/api/setlists`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/workspace/:id` | Member | List setlists |
| POST | `/workspace/:id` | Member | Create setlist |
| GET | `/:setlistId` | Yes | Get setlist with songs |
| PUT | `/:setlistId` | Yes | Update setlist |
| DELETE | `/:setlistId` | Yes | Delete setlist |
| POST | `/:setlistId/songs` | Yes | Add song |
| DELETE | `/:setlistId/songs/:songId` | Yes | Remove song |
| PUT | `/:setlistId/reorder` | Yes | Reorder songs |
| POST | `/:setlistId/duplicate` | Yes | Duplicate setlist |
| POST | `/:setlistId/mc` | Yes | Add MC section |
| POST | `/:setlistId/set-break` | Yes | Add set break |
| GET | `/:setlistId/performers` | Yes | Get performers |
| PUT | `/:setlistId/performers` | Yes | Set performers |
| DELETE | `/:setlistId/items/:itemId` | Yes | Remove item |
| PUT | `/:setlistId/items/:itemId` | Yes | Update item |

### Gigs (`/api/gigs`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/workspace/:id` | Member | List gigs (filterable by type, status, date range) |
| POST | `/workspace/:id` | Member | Create gig |
| GET | `/:gigId` | Yes | Get gig details |
| PUT | `/:gigId` | Yes | Update gig |
| DELETE | `/:gigId` | Yes | Delete gig |
| PUT | `/:gigId/complete` | Yes | Mark gig as completed |
| POST | `/:gigId/duplicate` | Yes | Duplicate gig |
| POST | `/:gigId/setlists` | Yes | Add setlist to gig |
| PUT | `/:gigId/setlists/reorder` | Yes | Reorder setlists |
| DELETE | `/:gigId/setlists/:gigSetlistId` | Yes | Remove setlist from gig |
| POST | `/:gigId/media` | Yes | Add media |
| DELETE | `/:gigId/media/:mediaId` | Yes | Delete media |

### Other Band Features

| Route Prefix | Endpoints | Description |
|---|---|---|
| `/api/band-members` | GET, POST, GET/:id, PUT/:id, DELETE/:id | Band member roster with instrument stints |
| `/api/availability` | GET, POST/date/:date, PUT/date/:date, DELETE/date/:date | Member availability calendar |
| `/api/contacts` | GET, POST, GET/:id, PUT/:id, DELETE/:id | Shared contacts (venues, engineers, etc.) |
| `/api/announcements` | GET, POST, GET/:id, PUT/:id, DELETE/:id, POST/:id/acknowledge | Workspace announcements |
| `/api/polls` | GET, POST, GET/:id, PUT/:id, DELETE/:id, POST/:id/vote, POST/:id/close | Polls for band decisions |
| `/api/medleys` | GET, POST, GET/:id, PUT/:id, DELETE/:id, PUT/:id/reorder | Song medleys/groupings |
| `/api/timeline` | GET, POST, PUT/:id, DELETE/:id | Band history timeline |
| `/api/achievements` | GET/definitions, GET/workspace/:id/leaderboard, POST/workspace/:id/award | Badges and achievements |
| `/api/recordings` | GET, POST, GET/:id, PUT/:id, DELETE/:id | Band recordings |
| `/api/kitty` | GET, POST/transactions, PUT/transactions/:id, DELETE/transactions/:id | Band finances |

### Utility

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/link-preview` | Yes | Fetch URL metadata for rich previews |
| GET | `/api/push/vapid-key` | No | Get VAPID public key |
| POST | `/api/push/subscribe` | Yes | Subscribe to push notifications |
| POST | `/api/push/unsubscribe` | Yes | Unsubscribe |
| GET | `/api/push/snooze-status` | Yes | Get snooze status |
| POST | `/api/push/snooze` | Yes | Snooze notifications |
| POST | `/api/uploads` | Yes | Upload single file (max 10MB) |
| POST | `/api/uploads/multiple` | Yes | Upload multiple files (max 5) |
| POST | `/api/slack-import/workspace/:id/import` | Admin | Import from Slack export |
| POST | `/api/reports` | Yes | Report a message |
| GET | `/api/blocks` | Yes | List blocked users |
| POST | `/api/blocks` | Yes | Block a user |
| DELETE | `/api/blocks/:userId` | Yes | Unblock a user |
| GET | `/api/health` | No | Health check |

---

## WebSocket Events

### Server → Client (Broadcast)

| Event | Payload | Description |
|---|---|---|
| `message:new` | message object | New message in channel |
| `message:reply` | message object | New thread reply |
| `message:updated` | { id, content, updatedAt } | Message edited |
| `message:deleted` | { id, channelId } | Message deleted |
| `reaction:added` | { messageId, emoji, user } | Reaction added |
| `reaction:removed` | { messageId, emoji, userId } | Reaction removed |
| `message:pinned` | { messageId, channelId } | Message pinned |
| `message:unpinned` | { messageId, channelId } | Message unpinned |
| `typing:start` | { channelId, userId, displayName } | User typing |
| `typing:stop` | { channelId, userId } | User stopped typing |
| `presence:updated` | { userId, status } | Online status changed |
| `channel:created` | channel object | New channel created |
| `channel:updated` | channel object | Channel info changed |
| `channel:deleted` | { channelId } | Channel deleted |
| `channel:member:added` | { channelId, userId } | Member added to channel |
| `channel:member:removed` | { channelId, userId } | Member removed from channel |
| `dm:created` | channel object | New DM created |
| `song:created` | song object | New song added |
| `member:removed` | { workspaceId, userId } | Member removed from workspace |
| `force:logout` | - | Force logout (account deleted) |
| `slack-import:progress` | { stage, current, total, detail } | Slack import progress |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `channel:join` | channelId | Join channel room |
| `channel:leave` | channelId | Leave channel room |
| `typing:start` | { channelId } | Start typing indicator |
| `typing:stop` | { channelId } | Stop typing indicator |
| `presence:update` | { status } | Update presence status |
| `workspace:join` | workspaceId | Join workspace room |

### Socket Authentication
- JWT token passed via `socket.handshake.auth.token`
- On connect: user auto-joins `user:{userId}` room + all workspace/channel rooms
- Rate limits applied per-event (e.g., typing: 5/sec, channel join: 10/10sec)

---

## Authentication & Security

### JWT Token Flow
1. Login/signup returns access token (15 min) + refresh token (14 days)
2. Access token sent in `Authorization: Bearer <token>` header
3. When expired, client calls `POST /auth/refresh` with refresh token
4. Server rotates refresh token (old one invalidated)
5. Refresh tokens are SHA-256 hashed before database storage

### Middleware Chain
| Middleware | Description |
|---|---|
| `authenticate` | Verifies JWT, attaches `req.user` |
| `isWorkspaceMember` | Checks workspace membership via `req.params.workspaceId` |
| `isWorkspaceAdmin` | Checks admin role |
| `isChannelMember` | Checks channel membership (public channels allow all workspace members) |

### Rate Limits
| Scope | Limit | Window |
|---|---|---|
| General API | 1000 requests | 15 minutes |
| Auth endpoints (login, signup, etc.) | 10 attempts | 15 minutes |
| Token verification (email, password reset) | 10 attempts | 15 minutes |
| Message creation | 30 messages | 1 minute |
| Socket events | Varies per event | 1-10 seconds |

### Security Features
- Passwords hashed with bcrypt (12 rounds)
- Helmet HTTP security headers (CSP, X-Frame-Options, etc.)
- CORS restricted to configured origins
- Frame ancestors set to `'none'`
- Input validation on display names (XSS prevention)
- Avatar URL validation (HTTP/HTTPS only)
- Admins cannot change other users' emails
- Password reset revokes all sessions
- Account deletion anonymizes messages
- Content reporting with email notification
- User blocking with server-side message filtering

---

## Third-Party Services

### Cloudinary
- **Purpose:** File and image hosting
- **Usage:** Profile avatars, message attachments, gig media, song attachments
- **Config:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`
- **Limits:** 10MB per file, 5 files per batch upload

### Resend
- **Purpose:** Transactional email delivery
- **Usage:** Email verification, password reset, workspace invitations, content reports
- **Config:** `RESEND_API_KEY`, `RESEND_DOMAIN`
- **From address:** `noreply@bandchat.app`
- **Fallback:** If no API key, emails are logged to console

### Google OAuth
- **Purpose:** Google Sign-In authentication
- **Usage:** Login/signup via Google account, account linking
- **Config:** `GOOGLE_CLIENT_ID` (shared between server, web client, mobile)
- **Library:** `google-auth-library` (server), `@react-oauth/google` (web client)

### Railway
- **Purpose:** Application hosting and managed PostgreSQL
- **Services:** Database, server (Node.js), client (static site)
- **Auto-deploy:** From `main` branch

### GetSongBPM
- **Purpose:** Song metadata enrichment (BPM, key, duration)
- **Usage:** Bulk import and manual enrichment of song database
- **Attribution:** Required, shown in app footer

---

## Client Architecture

### Project Structure
```
client/src/
├── components/
│   ├── auth/           # Login, Signup, GoogleSignInButton, ForgotPassword, ResetPassword
│   ├── band/           # Songs, Setlists, Calendar, Stats, Members, Practice, Kitty, etc. (23 components)
│   ├── channels/       # Sidebar, ChannelView, ChannelMembersPanel, PinnedMessages
│   ├── common/         # ConfirmDialog, ContextMenu, Footer, MemberProfile, Skeleton, etc.
│   ├── legal/          # PrivacyPolicy, TermsOfService
│   ├── messages/       # MessageList, MessageInput, ReactionPicker, LinkPreviewCard
│   ├── navigation/     # MobileNav
│   ├── threads/        # ThreadView
│   └── workspaces/     # WorkspaceList, WorkspaceView, OnboardingWizard, SlackImportWizard
├── context/            # AuthContext, SocketContext, ThemeContext, ToastContext
├── hooks/              # useLongPress
├── services/           # api.js, push.js, haptic.js, platform.js
└── styles/             # main.css (Tailwind + custom properties)
```

### Routes
| Path | Component | Auth |
|---|---|---|
| `/login` | Login | Public only |
| `/signup` | Signup | Public only |
| `/forgot-password` | ForgotPassword | Public only |
| `/reset-password` | ResetPassword | Public only |
| `/verify-email-change` | VerifyEmailChange | None |
| `/privacy` | PrivacyPolicy | None |
| `/terms` | TermsOfService | None |
| `/join/:inviteCode` | JoinWorkspace | Private |
| `/workspace/:workspaceId/*` | WorkspaceView | Private |
| `/` | WorkspaceList | Private |

### Theming
- 20+ themes via CSS custom properties (`--color-primary`, `--color-sidebar-bg`, etc.)
- Dark/light mode toggle
- Theme stored in `ThemeContext` and persisted to localStorage

---

## Mobile App Architecture

### Project Structure
```
mobile/src/
├── screens/            # 37 screens organized by feature
│   ├── auth/           # Login, Signup, ForgotPassword
│   ├── band/           # Songs, Setlists, Gigs, Stats, Members, etc. (21 screens)
│   ├── settings/       # Settings, EditProfile, Security, Appearance, Notifications
│   └── workspace/      # Channels, Messages, Threads, Search, MemberProfile
├── components/         # MessageBubble, MessageActionSheet, shared components
├── context/            # AuthContext, SocketContext, ThemeContext, ToastContext
├── services/           # api.js (~1200 lines), notifications.js, storage.js
└── utils/              # haptics.js, helpers
```

### Navigation
- `@react-navigation/native-stack`
- AuthStack (Login, Signup, ForgotPassword) + AppStack (all other screens)
- Deep linking support for invite codes

### Native Features
- Push notifications (Expo Notifications)
- Device calendar sync (Expo Calendar)
- Camera and photo library (Expo Image Picker)
- Haptic feedback (Expo Haptics)
- Secure token storage (Expo Secure Store)
- Pull-to-refresh on all list screens
- Skeleton loaders for loading states
- Error boundary wrapping entire app
- Offline detection banner

### Build Configuration
- **Bundle ID:** `com.bandchat.mobile`
- **EAS profiles:** development (internal), preview (TestFlight), production
- **Plugins:** expo-secure-store, expo-asset, expo-font, expo-haptics, expo-calendar, expo-image-picker, expo-notifications
