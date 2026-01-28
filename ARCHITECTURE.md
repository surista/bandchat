# BandChat Architecture

This document describes the technical architecture, data flow, and design decisions of BandChat.

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Data Model](#data-model)
- [Authentication Flow](#authentication-flow)
- [Real-time Communication](#real-time-communication)
- [API Design](#api-design)
- [Frontend Architecture](#frontend-architecture)
- [Security](#security)
- [Performance Considerations](#performance-considerations)

---

## System Overview

BandChat is a Slack-like collaboration platform designed for bands and musicians. It combines real-time messaging with band-specific features like song management, setlist building, gig tracking, and availability calendars.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (React)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │   Auth   │  │ Messages │  │  Band    │  │   Common     │    │
│  │  Context │  │   View   │  │ Features │  │  Components  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘    │
│       │             │             │                             │
│  ┌────┴─────────────┴─────────────┴───────────────────────┐    │
│  │              API Service (fetch)                        │    │
│  │              Socket.IO Client                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                      Server (Express)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │   Auth   │  │   REST   │  │ Socket   │  │   Services   │   │
│  │Middleware│  │  Routes  │  │ Handlers │  │ (Cloudinary) │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘   │
│       │             │             │                            │
│  ┌────┴─────────────┴─────────────┴───────────────────────┐   │
│  │                    Prisma ORM                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────┐
                    │    PostgreSQL     │
                    │     Database      │
                    └───────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with hooks |
| **Vite** | Build tool and dev server |
| **Tailwind CSS** | Utility-first styling |
| **React Router 6** | Client-side routing |
| **Socket.IO Client** | Real-time communication |
| **@dnd-kit** | Drag and drop for setlists |
| **date-fns** | Date formatting and manipulation |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **Express** | HTTP server and routing |
| **Socket.IO** | WebSocket server |
| **Prisma** | Database ORM |
| **PostgreSQL** | Primary database |
| **JWT** | Authentication tokens |
| **Cloudinary** | Image hosting |
| **Resend** | Transactional emails |

---

## Data Model

### Core Entities

```
User ─────────────┬────────── WorkspaceMember ──────────── Workspace
                  │                                            │
                  │                                            │
                  ▼                                            ▼
            ChannelMember ────────── Channel ◄────────── ChannelGroup
                  │                     │
                  │                     │
                  ▼                     ▼
               Message ◄─────────── Attachment
                  │
                  ▼
              Reaction
```

### Band Features

```
Workspace
    │
    ├── Song ──────────────── SongAttachment
    │     │
    │     └── SetlistSong ──── Setlist ──── GigSetlist ──── Gig
    │                              │                          │
    │                              └── SetlistPerformer       ├── GigAttendee
    │                                       │                 ├── GigSong
    │                                       │                 └── GigMedia
    │                                       ▼
    ├── BandMember ◄─────────────── InstrumentStint
    │
    ├── Medley ──────────────── MedleySong
    │
    ├── Contact
    │
    ├── Announcement ──────── AnnouncementAcknowledgment
    │
    ├── Poll ──────────────── PollOption ──────── PollVote
    │
    ├── TimelineEvent
    │
    ├── MemberAvailability
    │
    └── Recording
```

### Key Relationships

| Relationship | Description |
|--------------|-------------|
| User → Workspaces | Users can belong to multiple workspaces (bands) |
| Workspace → Channels | Each workspace has multiple channels |
| Channel → Messages | Messages belong to channels, can have threads (parentId) |
| Workspace → Songs | Songs are workspace-specific |
| Song → Setlist | Songs are added to setlists via SetlistSong junction |
| Gig → Setlists | Gigs can have multiple setlists (multi-set support) |
| BandMember → InstrumentStint | Track instrument history over time |
| BandMember ↔ User | Optional link between band members and user accounts |

### Permission Model

```
Workspace
    │
    ├── ADMIN
    │   ├── Manage members (invite, remove, change roles)
    │   ├── Delete channels
    │   ├── Manage locked gigs
    │   ├── Create announcements
    │   └── Regenerate timeline
    │
    └── MEMBER
        ├── Create channels
        ├── Send messages
        ├── Manage songs, setlists, gigs
        ├── Update own profile
        └── Set own availability
```

---

## Authentication Flow

### JWT Token Strategy

BandChat uses short-lived access tokens with refresh tokens for security:

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │         │  Server  │         │    DB    │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │  POST /login       │                    │
     │  {email, password} │                    │
     │───────────────────►│                    │
     │                    │  Verify user       │
     │                    │───────────────────►│
     │                    │◄───────────────────│
     │                    │                    │
     │                    │  Generate tokens   │
     │  {accessToken,     │  Store refresh     │
     │   refreshToken}    │───────────────────►│
     │◄───────────────────│                    │
     │                    │                    │
     │  API Request       │                    │
     │  Auth: Bearer xxx  │                    │
     │───────────────────►│                    │
     │                    │  Verify JWT        │
     │  Response          │                    │
     │◄───────────────────│                    │
     │                    │                    │
     │  (Token expired)   │                    │
     │  POST /refresh     │                    │
     │  {refreshToken}    │                    │
     │───────────────────►│                    │
     │                    │  Verify + rotate   │
     │  {new tokens}      │───────────────────►│
     │◄───────────────────│                    │
```

### Token Details

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access Token | 15 minutes | Memory/localStorage | API authentication |
| Refresh Token | 7 days | httpOnly cookie / localStorage | Obtain new access tokens |

### Google OAuth Flow

```
Client                    Server                    Google
   │                         │                         │
   │  Click "Sign in with    │                         │
   │  Google" button         │                         │
   │────────────────────────►│                         │
   │                         │                         │
   │  (Google popup)         │                         │
   │◄────────────────────────────────────────────────►│
   │  Google ID Token        │                         │
   │                         │                         │
   │  POST /auth/google      │                         │
   │  {credential}           │                         │
   │────────────────────────►│                         │
   │                         │  Verify token           │
   │                         │────────────────────────►│
   │                         │  User info              │
   │                         │◄────────────────────────│
   │                         │                         │
   │                         │  Create/find user       │
   │  {accessToken, user}    │  Generate tokens        │
   │◄────────────────────────│                         │
```

---

## Real-time Communication

### Socket.IO Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Socket.IO Server                        │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  workspace:123  │  │  workspace:456  │   (Rooms)         │
│  │                 │  │                 │                    │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                   │
│  │  │channel:a  │  │  │  │channel:x  │  │                   │
│  │  │ User1     │  │  │  │ User3     │  │                   │
│  │  │ User2     │  │  │  └───────────┘  │                   │
│  │  └───────────┘  │  │                 │                   │
│  │  ┌───────────┐  │  │                 │                   │
│  │  │channel:b  │  │  │                 │                   │
│  │  │ User1     │  │  │                 │                   │
│  │  └───────────┘  │  │                 │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Event Flow

1. **Connection**: Client connects with JWT in auth
2. **Join Workspace**: Client joins `workspace:{id}` room
3. **Join Channel**: Client joins `channel:{id}` room
4. **Message Sent**:
   - HTTP POST creates message
   - Server emits `message:new` to channel room
5. **Real-time Updates**: All channel members receive event

### Key Events

| Event | Direction | Payload | Trigger |
|-------|-----------|---------|---------|
| `message:new` | Server→Client | Message object | New message created |
| `message:updated` | Server→Client | Message object | Message edited |
| `message:deleted` | Server→Client | `{messageId}` | Message deleted |
| `typing:start` | Both | `{channelId, user}` | User typing |
| `typing:stop` | Both | `{channelId, userId}` | User stopped |
| `gig:created` | Server→Client | Gig object | New gig |
| `reaction:added` | Server→Client | Reaction object | Emoji added |
| `mention` | Server→Client | `{messageId, channelId}` | User @mentioned |

---

## API Design

### RESTful Patterns

```
GET    /api/workspaces              # List all
POST   /api/workspaces              # Create
GET    /api/workspaces/:id          # Get one
PUT    /api/workspaces/:id          # Update
DELETE /api/workspaces/:id          # Delete

# Nested resources
GET    /api/channels/workspace/:wid # Channels in workspace
POST   /api/channels/workspace/:wid # Create in workspace
GET    /api/messages/channel/:cid   # Messages in channel
```

### Authentication Middleware Chain

```javascript
router.get('/resource/:id',
  authenticate,        // Verify JWT, set req.user
  isWorkspaceMember,   // Check workspace membership
  async (req, res) => {
    // Handler
  }
);
```

### Response Patterns

**Success:**
```json
{
  "id": "...",
  "name": "...",
  // resource fields
}
```

**Error:**
```json
{
  "error": "Human-readable message"
}
```

**Paginated:**
```json
{
  "messages": [...],
  "hasMore": true,
  "nextCursor": "..."
}
```

---

## Frontend Architecture

### Component Hierarchy

```
App
├── AuthProvider (context)
│   ├── SocketProvider (context)
│   │   ├── ThemeProvider (context)
│   │   │   └── Routes
│   │   │       ├── PublicRoute
│   │   │       │   ├── Login
│   │   │       │   └── Signup
│   │   │       │
│   │   │       └── PrivateRoute
│   │   │           └── WorkspaceView
│   │   │               ├── Sidebar
│   │   │               │   ├── ChannelList
│   │   │               │   ├── DMList
│   │   │               │   └── Settings
│   │   │               │
│   │   │               ├── ChannelView
│   │   │               │   ├── MessageList
│   │   │               │   └── MessageInput
│   │   │               │
│   │   │               ├── ThreadView
│   │   │               │
│   │   │               └── BandFeatures
│   │   │                   ├── SongList
│   │   │                   ├── SetlistBuilder
│   │   │                   ├── GigCalendar
│   │   │                   └── ...
```

### Component Quick Reference

Visual layout of the main workspace screen:

```
┌─────────────────────────────────────────────────────────────────┐
│                        WorkspaceView                            │
├─────────────────┬───────────────────────────────┬───────────────┤
│                 │                               │               │
│    Sidebar      │       ChannelView             │  ThreadView   │
│                 │                               │   (panel)     │
│  ┌───────────┐  │  ┌─────────────────────────┐  │               │
│  │ Channels  │  │  │      MessageList        │  │  (opens when  │
│  │ Sections  │  │  │                         │  │  you click    │
│  │ DMs       │  │  │  (shows all messages)   │  │  "X replies") │
│  │ Band Menu │  │  │                         │  │               │
│  │ Members   │  │  └─────────────────────────┘  │               │
│  │ Settings  │  │  ┌─────────────────────────┐  │               │
│  └───────────┘  │  │     MessageInput        │  │               │
│                 │  │  (text box + file btn)  │  │               │
│                 │  └─────────────────────────┘  │               │
└─────────────────┴───────────────────────────────┴───────────────┘
```

**Main UI Components:**

| Common Name | Component File | Description |
|-------------|----------------|-------------|
| Sidebar | `Sidebar.jsx` | Left panel with channels, DMs, band menu, members |
| Channel view / main area | `ChannelView.jsx` | Center area showing messages for selected channel |
| Message list | `MessageList.jsx` | Scrollable list of messages |
| Message input / text box | `MessageInput.jsx` | Compose area with file upload button |
| Thread / thread panel | `ThreadView.jsx` | Right panel for threaded replies |
| Emoji picker | `ReactionPicker.jsx` | Popup for selecting emoji reactions |
| Confirm dialog | `ConfirmDialog.jsx` | Modal for delete confirmations |
| Member profile | `MemberProfile.jsx` | Popup showing user details |

**Band Features (accessed via sidebar menu):**

| Common Name | Component File | Description |
|-------------|----------------|-------------|
| Songs | `SongList.jsx` | Song database with BPM, key, lyrics |
| Setlists | `SetlistList.jsx` | List of setlists |
| Setlist builder | `SetlistBuilder.jsx` | Drag-and-drop setlist editor |
| Gigs / calendar | `GigCalendar.jsx` | Upcoming and past gigs |
| Gig archive | `GigArchive.jsx` | Historical gig data |
| Availability | `AvailabilityCalendar.jsx` | Member availability calendar |
| Polls | `PollsList.jsx` | Band voting/polls |
| Recordings | `RecordingsList.jsx` | Practice/gig recordings |
| Contacts | `ContactsList.jsx` | Venues, promoters, contacts |
| Band kitty | `BandKitty.jsx` | Shared band finances |
| Announcements | `AnnouncementsList.jsx` | Pinned announcements |

**Auth Components:**

| Common Name | Component File |
|-------------|----------------|
| Login page | `Login.jsx` |
| Signup page | `Signup.jsx` |
| Forgot password | `ForgotPassword.jsx` |
| Reset password | `ResetPassword.jsx` |

### State Management

| State | Location | Purpose |
|-------|----------|---------|
| Auth state | AuthContext | User, tokens, login/logout |
| Socket | SocketContext | Connection, event handlers |
| Theme | ThemeContext | Color theme preference |
| Workspace data | WorkspaceView state | Current workspace, channels |
| Messages | ChannelView state | Current channel messages |
| UI state | Component state | Modals, forms, loading |

### Data Fetching Pattern

```javascript
// In component
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  loadData();
}, [dependency]);

const loadData = async () => {
  setLoading(true);
  try {
    const result = await api.getData(id);
    setData(result);
  } catch (err) {
    console.error('Failed to load:', err);
  } finally {
    setLoading(false);
  }
};
```

---

## Security

### Authentication
- Passwords hashed with bcrypt (10 rounds)
- JWT with RS256 or HS256 signing
- Refresh token rotation
- Session revocation support

### Authorization
- Workspace membership verified on each request
- Admin-only actions explicitly checked
- Channel privacy enforced

### Input Validation
- Request body validation in routes
- Prisma prevents SQL injection
- File uploads restricted to images

### Rate Limiting
- General API: 100 req/15min per IP
- Auth endpoints: 5 req/15min per IP
- Message sending: 30/min per user

### CORS
- Origins explicitly whitelisted
- Credentials allowed for cookies

---

## Performance Considerations

### Database
- Indexes on frequently queried columns
- Pagination for message lists (cursor-based)
- Eager loading where appropriate (Prisma `include`)

### Real-time
- Room-based Socket.IO (not broadcast to all)
- Typing indicators throttled
- Connection authentication once

### Frontend
- Code splitting via React Router
- Image lazy loading
- Tailwind CSS purging for production

### Caching Opportunities
- Workspace membership (short TTL)
- Song metadata after enrichment
- Static assets via CDN (Cloudinary)

---

## Deployment Architecture

### Production (Railway)

```
┌─────────────────────────────────────────────────────────┐
│                       Railway                            │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │   Frontend   │     │   Backend    │                  │
│  │   (Static)   │────►│   (Node.js)  │                  │
│  │              │     │              │                  │
│  └──────────────┘     └──────┬───────┘                  │
│                              │                          │
│                              ▼                          │
│                    ┌──────────────┐                     │
│                    │  PostgreSQL  │                     │
│                    │  (Railway)   │                     │
│                    └──────────────┘                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      ┌─────────────┐
    │ Cloudinary  │      │   Resend    │
    │  (Images)   │      │  (Emails)   │
    └─────────────┘      └─────────────┘
```

### Environment Configuration

See `.env.example` files for all configuration options. Key considerations:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Use strong random value in production
- `CLIENT_URL`: For CORS and email links
- Optional services degrade gracefully if not configured
