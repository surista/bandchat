# BandChat Website Sync Specification

This document defines the API contract between BandChat and the public band website (frozen).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BandChat Server                          │
│                    (Source of Truth)                            │
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Gigs   │ │  Songs  │ │ Members │ │Timeline │ │ Polls   │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │           │           │           │           │        │
│       └───────────┴───────────┴───────────┴───────────┘        │
│                               │                                 │
│                      REST API Endpoints                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                          HTTPS (Pull)
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Website Sync Script                           │
│                     (scripts/sync.js)                             │
│                                                                   │
│  1. Authenticate with BandChat                                    │
│  2. Fetch data from all endpoints                                 │
│  3. Transform (strip private fields)                              │
│  4. Write static JSON to /public/data/                            │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Public Website (Vercel)                       │
│                                                                   │
│  /public/data/                                                    │
│  ├── gigs-upcoming.json                                           │
│  ├── gigs-archive.json                                            │
│  ├── songs.json                                                   │
│  ├── setlists.json                                                │
│  ├── band-members.json                                            │
│  ├── timeline.json                                                │
│  ├── announcements.json                                           │
│  ├── polls.json                                                   │
│  ├── media.json                                                   │
│  └── stats.json                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Sync Model

**Direction:** PULL (website pulls from BandChat)

**Trigger:** Manual (`node scripts/sync.js`)

**Authentication:** Email/password login, receives JWT token

**Caching:** Website caches JSON for 5 minutes client-side

---

## API Endpoints

All endpoints require authentication via `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login, returns `accessToken` |

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbG...",
  "user": { "id": "...", "email": "...", "displayName": "..." }
}
```

---

### Data Endpoints

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/gigs/workspace/:workspaceId` | All gigs with setlists, attendees, media |
| GET | `/api/songs/workspace/:workspaceId` | All songs |
| GET | `/api/setlists/workspace/:workspaceId` | All setlists with songs and performers |
| GET | `/api/band-members/workspace/:workspaceId` | Current, former, and guest members |
| GET | `/api/timeline/workspace/:workspaceId` | Timeline events |
| GET | `/api/announcements/workspace/:workspaceId` | Announcements |
| GET | `/api/polls/workspace/:workspaceId` | Polls with options and vote counts |

---

## Data Schemas

### Gig (Public Fields)

```typescript
interface PublicGig {
  id: string;
  title: string;
  type: 'GIG' | 'REHEARSAL' | 'MEETING' | 'OTHER';
  date: string;          // ISO datetime
  endDate?: string;
  venue?: string;
  address?: string;
  notes?: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | 'COMPLETED';
  setlists: GigSetlist[];
  media: GigMedia[];
  attendees: GigAttendee[];
}

// EXCLUDED (private): pay, isLocked, isPersonal, createdById
```

### Song (Public Fields)

```typescript
interface PublicSong {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  bpm?: number;
  duration?: number;     // seconds
  youtubeUrl?: string;
  spotifyUrl?: string;
  _count?: {
    setlistSongs: number;  // times played
  };
}

// EXCLUDED (private): lyrics, notes, arrangement, attachments
```

### Setlist (Public Fields)

```typescript
interface PublicSetlist {
  id: string;
  name: string;
  description?: string;
  performedAt?: string;  // ISO datetime
  venue?: string;
  songs: SetlistSong[];
  performers: SetlistPerformer[];
}

interface SetlistSong {
  position: number;
  type: 'SONG' | 'MC' | 'BREAK';
  duration?: number;
  label?: string;        // for MC/BREAK sections
  song?: {
    id: string;
    title: string;
    artist?: string;
    key?: string;
    duration?: number;
  };
}

interface SetlistPerformer {
  bandMember: {
    id: string;
    name: string;
    imageUrl?: string;
  };
}
```

### Band Member (Public Fields)

```typescript
interface PublicBandMember {
  id: string;
  name: string;
  imageUrl?: string;
  notes?: string;        // public bio
  isGuest: boolean;
  stints: MemberStint[];
}

interface MemberStint {
  instruments: string[];
  startDate?: string;
  endDate?: string;      // null = current member
}
```

### Timeline Event (Public Fields)

```typescript
interface PublicTimelineEvent {
  id: string;
  title: string;
  description?: string;
  eventType: 'MILESTONE' | 'MEMBER_JOIN' | 'MEMBER_LEAVE' | 'GIG' | 'RECORDING' | 'OTHER';
  eventDate: string;
  imageUrl?: string;
}
```

### Announcement (Public Fields)

```typescript
interface PublicAnnouncement {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  isPinned: boolean;
  createdAt: string;
  createdBy: {
    displayName: string;
  };
}

// Only syncs: isPinned=true AND (no expiresAt OR expiresAt > now)
```

### Poll (Public Fields)

```typescript
interface PublicPoll {
  id: string;
  question: string;
  description?: string;
  allowMultiple: boolean;
  isClosed: boolean;
  expiresAt?: string;
  createdAt: string;
  options: PollOption[];
}

interface PollOption {
  id: string;
  text: string;
  position: number;
  _count: {
    votes: number;
  };
}

// EXCLUDED: isAnonymous=true polls (never synced)
```

### Stats (Computed)

```typescript
interface PublicStats {
  totalGigs: number;      // archived gigs only
  totalSongs: number;
  totalMembers: number;   // excluding guests
  totalVenues: number;
  topVenues: { venue: string; count: number }[];
  lastUpdated: string;    // ISO datetime
}
```

---

## Sync Transformations

The sync script applies these transformations:

| Data | Transformation |
|------|----------------|
| Gigs | Split into `upcoming` (future, not cancelled) and `archive` (past or completed) |
| Gigs | Filter out `isPersonal=true` and non-GIG types |
| Songs | Strip `lyrics`, `notes`, `arrangement` |
| Announcements | Only sync pinned + non-expired |
| Polls | Exclude anonymous polls |
| Media | Flatten from all gigs into single array |

---

## Output Files

| File | Source | Content |
|------|--------|---------|
| `gigs-upcoming.json` | Gigs | Future gigs, sorted by date ascending |
| `gigs-archive.json` | Gigs | Past gigs, sorted by date descending |
| `songs.json` | Songs | All songs |
| `setlists.json` | Setlists | All setlists with songs |
| `band-members.json` | Band Members | All members (current, former, guests) |
| `timeline.json` | Timeline | All events |
| `announcements.json` | Announcements | Pinned, non-expired only |
| `polls.json` | Polls | Non-anonymous only |
| `media.json` | Gigs | All media from all gigs |
| `stats.json` | Computed | Aggregate statistics |
| `blog.json` | N/A | Empty (no blog in BandChat yet) |

---

## Environment Variables

**Website (.env):**
```
SYNC_BANDCHAT_URL=https://bandchat.app
SYNC_EMAIL=admin@yourband.com
SYNC_PASSWORD=your-password
SYNC_WORKSPACE_ID=your-workspace-uuid
```

---

## Security Considerations

1. **Private data exclusion:** Lyrics, notes, arrangement, pay, personal gigs are never synced
2. **Anonymous polls:** Never exposed to public website
3. **Authentication:** Sync requires valid workspace member credentials
4. **HTTPS only:** All API calls over TLS

---

## Future Enhancements

| Feature | Description |
|---------|-------------|
| Push model | BandChat triggers website rebuild via Vercel deploy hook |
| "Publish to Website" button | Desktop UI to trigger sync |
| Selective sync | Choose which gigs/songs to make public |
| Blog integration | Pull from designated channel or new blog entity |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-02 | 1.0 | Initial specification |
