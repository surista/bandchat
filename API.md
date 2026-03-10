# BandChat API Documentation

Base URL: `/api`

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Responses](#error-responses)
- [Endpoints](#endpoints)
  - [Auth](#auth)
  - [Workspaces](#workspaces)
  - [Channels](#channels)
  - [Channel Groups](#channel-groups)
  - [Messages](#messages)
  - [Songs](#songs)
  - [Setlists](#setlists)
  - [Gigs](#gigs)
  - [Band Members](#band-members)
  - [Availability](#availability)
  - [Contacts](#contacts)
  - [Announcements](#announcements)
  - [Polls](#polls)
  - [Medleys](#medleys)
  - [Timeline](#timeline)
  - [Recordings](#recordings)
  - [Achievements](#achievements)
  - [Suggestions](#suggestions)
  - [Push Notifications](#push-notifications)
  - [Uploads](#uploads)
- [Socket.IO Events](#socketio-events)

---

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained from `/api/auth/login` or `/api/auth/google` and expire after 15 minutes. Use the refresh token to obtain new access tokens.

### Permission Levels

| Level | Description |
|-------|-------------|
| **Public** | No authentication required |
| **Authenticated** | Valid JWT token required |
| **Workspace Member** | Must be a member of the workspace |
| **Workspace Admin** | Must have ADMIN role in the workspace |

---

## Rate Limiting

- General API: 100 requests per 15 minutes per IP
- Auth endpoints (login, signup): 5 requests per 15 minutes per IP
- Message sending: 30 messages per minute per user

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Endpoints

### Auth

Base path: `/api/auth`

#### Register

```http
POST /signup
```

Creates a new user account. Sends verification email if email service configured.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "message": "Account created. Please check your email to verify.",
  "user": { "id": "...", "email": "...", "displayName": "..." }
}
```

---

#### Login

```http
POST /login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { "id": "...", "email": "...", "displayName": "...", "avatarUrl": "..." }
}
```

---

#### Google OAuth

```http
POST /google
```

Sign in or sign up with Google. Creates account if user doesn't exist.

**Request Body:**
```json
{
  "credential": "google-id-token"
}
```

---

#### Refresh Token

```http
POST /refresh
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

---

#### Get Current User

```http
GET /me
```

**Auth:** Required

**Response:** `200 OK`
```json
{
  "id": "...",
  "email": "user@example.com",
  "displayName": "John Doe",
  "avatarUrl": "https://...",
  "bio": "Guitarist",
  "workspaces": [
    { "id": "...", "name": "My Band", "role": "ADMIN" }
  ]
}
```

---

#### Update Profile

```http
PUT /me
```

**Auth:** Required

**Request Body:**
```json
{
  "displayName": "New Name",
  "avatarUrl": "https://...",
  "bio": "New bio"
}
```

---

#### Change Password

```http
PUT /password
```

**Auth:** Required

**Request Body:**
```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

---

#### Forgot Password

```http
POST /forgot-password
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

Sends password reset email (requires RESEND_API_KEY).

---

#### Reset Password

```http
POST /reset-password
```

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "newpassword"
}
```

---

### Workspaces

Base path: `/api/workspaces`

#### List Workspaces

```http
GET /
```

**Auth:** Required

Returns all workspaces the user is a member of.

---

#### Create Workspace

```http
POST /
```

**Auth:** Required

**Request Body:**
```json
{
  "name": "My Band"
}
```

Creates workspace with #general channel, makes creator an ADMIN.

---

#### Get Workspace

```http
GET /:workspaceId
```

**Auth:** Workspace Member

**Response:**
```json
{
  "id": "...",
  "name": "My Band",
  "inviteCode": "ABC123",
  "members": [
    { "userId": "...", "role": "ADMIN", "user": { "displayName": "..." } }
  ],
  "channels": [...]
}
```

---

#### Join Workspace

```http
POST /join/:inviteCode
```

**Auth:** Required

Joins workspace using invite code.

---

#### Generate Invite Code

```http
POST /:workspaceId/invite-code
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "expiresInHours": 24,
  "maxUses": 10
}
```

---

#### Send Email Invite

```http
POST /:workspaceId/invite-email
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "email": "newmember@example.com"
}
```

---

#### Update Member Role

```http
PUT /:workspaceId/members/:userId
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "role": "ADMIN"
}
```

Role can be `ADMIN` or `MEMBER`.

---

#### Remove Member

```http
DELETE /:workspaceId/members/:userId
```

**Auth:** Workspace Admin

**Query Params:**
- `postAction`: `reassign` | `anonymize` | `delete` - What to do with their content

---

### Channels

Base path: `/api/channels`

#### List Channels

```http
GET /workspace/:workspaceId
```

**Auth:** Workspace Member

Returns all channels user has access to (public + private channels they're in).

---

#### Create Channel

```http
POST /workspace/:workspaceId
```

**Auth:** Workspace Member

**Request Body:**
```json
{
  "name": "new-channel",
  "description": "Channel description",
  "isPrivate": false
}
```

---

#### Get Channel

```http
GET /:channelId
```

**Auth:** Channel Member

---

#### Update Channel

```http
PUT /:channelId
```

**Auth:** Channel Member

**Request Body:**
```json
{
  "name": "renamed-channel",
  "description": "Updated description"
}
```

---

#### Delete Channel

```http
DELETE /:channelId
```

**Auth:** Workspace Admin

Cannot delete #general channel.

---

#### Add Channel Member

```http
POST /:channelId/members
```

**Auth:** Channel Member

**Request Body:**
```json
{
  "userId": "user-id-to-add"
}
```

---

#### Mark Channel Read

```http
POST /:channelId/read
```

**Auth:** Channel Member

Clears unread count for this channel.

---

#### Get/Create Direct Message

```http
POST /workspace/:workspaceId/dm
```

**Auth:** Workspace Member

**Request Body:**
```json
{
  "userIds": ["user-id-1", "user-id-2"]
}
```

Returns existing DM or creates new one.

---

### Channel Groups

Base path: `/api/channel-groups`

Organize channels into collapsible groups (like Slack sections).

#### List Groups

```http
GET /workspace/:workspaceId
```

---

#### Create Group

```http
POST /workspace/:workspaceId
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "name": "Important Channels"
}
```

---

#### Move Channel to Group

```http
PUT /:groupId/channels/:channelId
```

**Auth:** Workspace Admin

---

### Messages

Base path: `/api/messages`

#### Get Channel Messages

```http
GET /channel/:channelId
```

**Auth:** Channel Member

**Query Params:**
- `cursor`: Pagination cursor for older messages
- `limit`: Number of messages (default 50)

**Response:**
```json
{
  "messages": [...],
  "hasMore": true,
  "nextCursor": "..."
}
```

---

#### Send Message

```http
POST /channel/:channelId
```

**Auth:** Channel Member

**Request Body:**
```json
{
  "content": "Hello world!",
  "parentId": "optional-for-replies",
  "attachments": [
    { "type": "IMAGE", "url": "https://...", "filename": "photo.jpg" }
  ]
}
```

---

#### Update Message

```http
PUT /:messageId
```

**Auth:** Message Author

**Request Body:**
```json
{
  "content": "Updated message"
}
```

---

#### Delete Message

```http
DELETE /:messageId
```

**Auth:** Message Author or Workspace Admin

---

#### Get Thread Replies

```http
GET /:messageId/replies
```

---

#### Add Reaction

```http
POST /:messageId/reactions
```

**Request Body:**
```json
{
  "emoji": "thumbsup"
}
```

---

#### Remove Reaction

```http
DELETE /:messageId/reactions/:emoji
```

---

#### Search Messages

```http
GET /search/:workspaceId?q=search+term
```

---

### Songs

Base path: `/api/songs`

#### List Songs

```http
GET /workspace/:workspaceId
```

---

#### Create Song

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "title": "Sweet Child O' Mine",
  "artist": "Guns N' Roses",
  "key": "D",
  "bpm": 125,
  "duration": 356,
  "status": "READY",
  "lyrics": "...",
  "notes": "..."
}
```

Status options: `SUGGESTED`, `LEARNING`, `READY`, `RETIRED`

---

#### Bulk Import Songs

```http
POST /workspace/:workspaceId/bulk
```

**Request Body:**
```json
{
  "songs": [
    { "title": "Song 1", "artist": "Artist 1" },
    { "title": "Song 2", "artist": "Artist 2" }
  ],
  "autoEnrich": true
}
```

---

#### Enrich Songs with Metadata

```http
POST /workspace/:workspaceId/enrich
```

Fetches BPM, key, duration from external APIs for songs missing metadata.

---

#### Add Song Attachment

```http
POST /:songId/attachments
```

**Request Body:**
```json
{
  "type": "CHORD_CHART",
  "url": "https://...",
  "filename": "chords.pdf"
}
```

Types: `CHORD_CHART`, `LYRICS`, `AUDIO`, `VIDEO`, `OTHER`

---

### Setlists

Base path: `/api/setlists`

#### List Setlists

```http
GET /workspace/:workspaceId
```

---

#### Create Setlist

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "name": "Saturday Night Set",
  "description": "Wedding gig setlist",
  "performedAt": "2024-03-15T20:00:00Z",
  "venue": "Grand Ballroom"
}
```

---

#### Add Song to Setlist

```http
POST /:setlistId/songs
```

**Request Body:**
```json
{
  "songId": "...",
  "position": 0,
  "setNumber": 1,
  "notes": "Start quiet"
}
```

---

#### Add MC Break

```http
POST /:setlistId/mc
```

**Request Body:**
```json
{
  "content": "Introduce the band",
  "position": 5,
  "setNumber": 1
}
```

---

#### Add Set Break

```http
POST /:setlistId/set-break
```

**Request Body:**
```json
{
  "position": 10,
  "durationMinutes": 15
}
```

---

#### Reorder Setlist Items

```http
PUT /:setlistId/reorder
```

**Request Body:**
```json
{
  "items": [
    { "id": "item-id", "position": 0, "setNumber": 1 }
  ]
}
```

---

#### Import Setlist from Text

```http
POST /workspace/:workspaceId/import
```

**Request Body:**
```json
{
  "name": "Imported Set",
  "songs": "Song Title - Artist\nAnother Song - Artist",
  "performedAt": "2024-03-15",
  "venue": "Local Pub"
}
```

Matches song titles to existing library.

---

### Gigs

Base path: `/api/gigs`

#### List Gigs

```http
GET /workspace/:workspaceId
```

**Query Params:**
- `type`: `GIG` | `REHEARSAL` | `OTHER`
- `status`: `UPCOMING` | `CONFIRMED` | `COMPLETED` | `CANCELLED`
- `from`: ISO date string
- `to`: ISO date string

---

#### Create Gig

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "title": "Saturday Night Show",
  "type": "GIG",
  "date": "2024-03-15T20:00:00Z",
  "endDate": "2024-03-15T23:00:00Z",
  "soundCheckTime": "16:00",
  "eventStartTime": "19:00",
  "performanceStartTime": "20:00",
  "venue": "The Blue Note",
  "address": "123 Main St",
  "pay": 500,
  "notes": "Load in at 6pm",
  "isPublic": true,
  "attendeeIds": ["user-id-1", "user-id-2"]
}
```

Type: `GIG`, `REHEARSAL`, `OTHER`

---

#### Mark Gig Complete

```http
PUT /:gigId/complete
```

Records which songs were actually played.

---

#### Get Gig Statistics

```http
GET /workspace/:workspaceId/stats
```

**Response:**
```json
{
  "totalGigs": 45,
  "totalRehearsals": 120,
  "totalEarnings": 15000,
  "averagePay": 333,
  "topVenues": [...],
  "songPlayCounts": [...],
  "monthlyStats": [...]
}
```

---

#### Add Gig Media

```http
POST /:gigId/media
```

**Request Body:**
```json
{
  "type": "PHOTO",
  "url": "https://...",
  "caption": "Great crowd tonight!"
}
```

---

### Band Members

Base path: `/api/band-members`

Track current and former band members with their instrument history.

#### List Band Members

```http
GET /workspace/:workspaceId
```

**Response:**
```json
{
  "current": [...],
  "former": [...],
  "guests": [...],
  "all": [...]
}
```

---

#### Create Band Member

```http
POST /workspace/:workspaceId
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "name": "John Smith",
  "instruments": ["Guitar", "Vocals"],
  "startDate": "2020-01-15",
  "isGuest": false,
  "linkedUserId": "optional-user-id"
}
```

---

#### Add Instrument Stint

```http
POST /:bandMemberId/stints
```

Track when a member played different instruments.

**Request Body:**
```json
{
  "instruments": ["Bass"],
  "startDate": "2022-06-01",
  "endDate": null
}
```

---

### Availability

Base path: `/api/availability`

#### Get Team Availability

```http
GET /workspace/:workspaceId
```

**Query Params:**
- `from`: Start date
- `to`: End date

---

#### Set Availability

```http
PUT /workspace/:workspaceId/date/:date
```

**Request Body:**
```json
{
  "status": "AVAILABLE"
}
```

Status: `AVAILABLE`, `UNAVAILABLE`, `MAYBE`, `UNKNOWN`

---

### Contacts

Base path: `/api/contacts`

Store venue contacts, booking agents, etc.

#### List Contacts

```http
GET /workspace/:workspaceId
```

**Query Params:**
- `category`: Filter by category

---

#### Create Contact

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "name": "Blue Note Booking",
  "category": "venue",
  "email": "booking@bluenote.com",
  "phone": "555-1234",
  "website": "https://bluenote.com",
  "address": "123 Jazz St",
  "notes": "Ask for Mike"
}
```

Categories: `venue`, `agent`, `sound_engineer`, `photographer`, `other`

---

### Announcements

Base path: `/api/announcements`

#### List Announcements

```http
GET /workspace/:workspaceId
```

**Query Params:**
- `pinned`: `true` to show only pinned

---

#### Create Announcement

```http
POST /workspace/:workspaceId
```

**Auth:** Workspace Admin

**Request Body:**
```json
{
  "title": "Band Meeting",
  "content": "Please join us Wednesday at 7pm",
  "isPinned": true,
  "requiresAcknowledgment": true
}
```

---

#### Acknowledge Announcement

```http
POST /:announcementId/acknowledge
```

---

### Polls

Base path: `/api/polls`

#### List Polls

```http
GET /workspace/:workspaceId
```

---

#### Create Poll

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "question": "What time works for rehearsal?",
  "options": ["7pm", "8pm", "9pm"],
  "allowMultiple": true,
  "expiresAt": "2024-03-20T00:00:00Z",
  "channelId": "optional-channel-id"
}
```

---

#### Vote on Poll

```http
POST /:pollId/vote
```

**Request Body:**
```json
{
  "optionIds": ["option-id-1"]
}
```

---

### Medleys

Base path: `/api/medleys`

Group songs that are performed together.

#### List Medleys

```http
GET /workspace/:workspaceId
```

---

#### Create Medley

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "name": "80s Medley",
  "description": "Our 80s hits mashup",
  "songIds": ["song-1", "song-2", "song-3"]
}
```

---

### Timeline

Base path: `/api/timeline`

Band history and milestones.

#### Get Timeline

```http
GET /workspace/:workspaceId
```

---

#### Create Timeline Event

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "title": "Band Formed",
  "description": "The beginning of our journey",
  "eventType": "formation",
  "eventDate": "2020-01-01",
  "imageUrl": "https://..."
}
```

Event types: `formation`, `first_gig`, `gig`, `rehearsal`, `member_joined`, `member_left`, `album_release`, `milestone`, `custom`

---

#### Auto-Generate Timeline

```http
POST /workspace/:workspaceId/generate
```

Automatically creates timeline events from gigs, rehearsals, and member data.

---

#### Regenerate Timeline

```http
POST /workspace/:workspaceId/regenerate
```

**Auth:** Workspace Admin

Clears auto-generated events and recreates from current data.

---

### Recordings

Base path: `/api/recordings`

#### List Recordings

```http
GET /workspace/:workspaceId
```

---

#### Create Recording

```http
POST /workspace/:workspaceId
```

**Request Body:**
```json
{
  "songId": "song-id",
  "title": "Live at Blue Note",
  "type": "LIVE",
  "url": "https://...",
  "recordedAt": "2024-03-15",
  "notes": "Great performance!"
}
```

Types: `DEMO`, `REHEARSAL`, `LIVE`, `STUDIO`, `OTHER`

---

### Achievements

Base path: `/api/achievements`

#### Get Band Achievements

```http
GET /workspace/:workspaceId/band-achievements
```

Returns milestones like "100 Gigs", "First Paid Gig", etc.

---

#### Get Member Achievements

```http
GET /workspace/:workspaceId/members/:userId/achievements
```

---

### Suggestions

Base path: `/api/suggestions`

AI-powered song and setlist recommendations.

#### Get Mashup Suggestions

```http
GET /workspace/:workspaceId/mashups/:songId
```

Find songs that would work well in a medley based on key and BPM compatibility.

---

#### Get Transition Analysis

```http
GET /workspace/:workspaceId/transitions
```

**Query Params:**
- `minScore`: Minimum compatibility score (0-100)

Returns all compatible song transitions.

---

#### Get Repertoire Recommendations

```http
GET /workspace/:workspaceId/recommendations
```

Analyzes your song library and suggests gaps to fill.

---

#### Optimize Setlist Order

```http
POST /workspace/:workspaceId/optimize-setlist
```

**Request Body:**
```json
{
  "songIds": ["song-1", "song-2", "song-3"]
}
```

Returns optimal song ordering for musical flow.

---

### Push Notifications

Base path: `/api/push`

#### Get VAPID Public Key

```http
GET /vapid-key
```

Returns the VAPID public key for web push subscriptions.

---

#### Subscribe to Push

```http
POST /subscribe
```

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
}
```

---

#### Unsubscribe

```http
DELETE /unsubscribe
```

---

### Uploads

Base path: `/api/uploads`

#### Upload Single Image

```http
POST /
```

**Content-Type:** `multipart/form-data`

**Body:** `file` - Image file (max 10MB)

**Response:**
```json
{
  "url": "https://res.cloudinary.com/...",
  "filename": "image.jpg",
  "type": "IMAGE"
}
```

---

#### Upload Multiple Images

```http
POST /multiple
```

**Content-Type:** `multipart/form-data`

**Body:** `files` - Up to 5 image files

---

## Socket.IO Events

Connect to the Socket.IO server at the same host as the API. Authenticate by including the JWT token:

```javascript
const socket = io(SOCKET_URL, {
  auth: { token: accessToken }
});
```

### Client Events (emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `join:workspace` | `workspaceId` | Join workspace room |
| `leave:workspace` | `workspaceId` | Leave workspace room |
| `join:channel` | `channelId` | Join channel room |
| `leave:channel` | `channelId` | Leave channel room |
| `typing:start` | `{ channelId }` | User started typing |
| `typing:stop` | `{ channelId }` | User stopped typing |

### Server Events (listen)

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `Message` | New message in channel |
| `message:updated` | `Message` | Message was edited |
| `message:deleted` | `{ messageId }` | Message was deleted |
| `message:reply` | `{ parentId, message }` | Reply added to thread |
| `reaction:added` | `{ messageId, reaction }` | Reaction added |
| `reaction:removed` | `{ messageId, emoji, userId }` | Reaction removed |
| `typing:start` | `{ channelId, user }` | Someone started typing |
| `typing:stop` | `{ channelId, userId }` | Someone stopped typing |
| `channel:created` | `Channel` | New channel created |
| `channel:updated` | `Channel` | Channel was updated |
| `channel:deleted` | `{ channelId }` | Channel was deleted |
| `member:joined` | `{ workspaceId, member }` | New workspace member |
| `member:removed` | `{ workspaceId, userId }` | Member removed |
| `gig:created` | `Gig` | New gig created |
| `gig:updated` | `Gig` | Gig was updated |
| `gig:deleted` | `{ gigId }` | Gig was deleted |
| `setlist:created` | `Setlist` | New setlist created |
| `setlist:updated` | `Setlist` | Setlist was updated |
| `announcement:created` | `Announcement` | New announcement |
| `mention` | `{ messageId, channelId }` | You were mentioned |

---

## Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-15T12:00:00.000Z"
}
```
