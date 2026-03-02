# BandChat Mobile — Project Roadmap

## Completed Phases

### Phase 1 — Auth & Workspaces
- Login (email/password)
- Google Sign-In
- Workspace list, join via invite code

### Phase 2 — Channels & Messaging
- Channel list with collapsible groups
- Channel creation
- Direct messages (1:1 and group)
- Real-time messaging via Socket.IO
- Typing indicators
- Unread badges

### Phase 3 — Threads, Reactions & Media
- Thread replies with unread tracking
- Emoji reactions with picker (5 categories)
- Message editing and deletion
- Message pinning
- Media attachments (images, video, audio)
- Image viewer
- Message action sheet (reply, react, copy, edit, delete, pin)

### Phase 4 — Songs, Setlists & Calendar
- Song list with search/filter/sort
- Song detail with attachments
- Song create/edit/delete
- Setlist list and builder
- Drag-and-drop song reordering
- MC sections and set breaks
- Gig/calendar list with type/status filters
- Gig detail with setlist association and media

### Phase 5 — Stats, Members & Coordination
- Band statistics dashboard
- Band members (current/former/guests, instruments, stints)
- Availability calendar (set status, bulk, summary)
- Contacts (list, create, edit, delete, categories)
- Announcements (list, create, acknowledge, pin)
- Polls (list, create, vote, close)

### Phase 6 — Settings & Profile
- Settings hub with grouped menu items
- Edit profile (avatar, display name, bio)
- Security (change password, change email, auth provider)
- Appearance (dark/light toggle, 12 theme swatches)
- Notifications (snooze options, status display)
- Workspace members (admin: toggle roles, remove)
- Invite people (copy code, share, regenerate, email invite)

### Phase 7 — Search & Channel Management
- Message search screen (full-text, filter by channel/author)
- Channel settings screen (edit name, manage members, delete)
- Channel mute toggle from channel header
- Link preview cards in message bubbles

### Phase 8 — Medleys & Recordings
- Medley list with expandable song lists
- Medley create/edit with song ordering (up/down/remove)
- Recording list with type/song filter chips
- Recording create with file upload (expo-document-picker)
- Inline audio/video playback (expo-av)

### Phase 9 — Timeline & Achievements
- Timeline screen with events grouped by year
- Create/edit/delete timeline events with type picker and date picker
- Auto-generate and regenerate timeline (admin)
- Achievements screen with 3 tabs (Band / My Badges / Leaderboard)
- Achievement check with celebration banner
- Stats summary cards

### Phase 10 — Band Kitty (Finances)
- Balance header with income/expense summary
- Transaction list with filtering (all/income/expenses)
- Transactions grouped by month
- Create/edit/delete transactions with type/category pickers
- Admin settings modal (currency, starting balance)

### Phase 11 — Song Intelligence
- 4-tab layout: Recommendations, Mashups, Transitions, Optimizer
- Repertoire analysis with song suggestions
- Mashup compatibility scoring with song picker
- Pairwise transition compatibility display
- Setlist optimizer with song selection and flow scoring

### Phase 12 — Advanced Gig Features
- Gig attendees display with status badges (Going/Maybe/Not Going)
- Gig completion flow (mark complete from detail and list screens)
- Haptic feedback on key actions

### Phase 13 — Auth & Onboarding
- Signup screen with validation
- Forgot password / reset password flow
- Login screen links to signup and forgot password
- Member profile viewer (stats, achievements, dates, role)
- Tap workspace member to view profile

### Phase 14 — Polish & Platform
- Skeleton loader components (line, circle, card, list)
- Error boundary wrapping entire app
- Offline banner with NetInfo connectivity detection
- Haptic feedback utility module
- Haptics on long-press action sheets and success actions

---

## Remaining Phases

### Phase 15 — Feature Completions
- Bulk song import (paste list, parse, import with metadata fetch)
- Song metadata enrichment (fetch missing BPM, key, duration)
- Setlist performers (view/edit who played each setlist)
- Cross-workspace calendar view (see gigs from all bands)
- Add gig to device calendar (expo-calendar integration)

---

## Platform-Specific Features

Some features are intentionally available on only one platform:

### Desktop/Web Only
| Feature | Reason |
|---------|--------|
| Audio Analyzer | CPU-intensive WASM (Essentia.js), file system access |
| Slack Import Wizard | One-time admin task, large file uploads |
| Bulk song import (paste) | Easier with keyboard and clipboard |
| Workspace data export | Large JSON downloads |

### Mobile Only
| Feature | Reason |
|---------|--------|
| Live Mode (optimized) | On-stage use with phone |
| Device calendar sync | Native calendar integration |
| Camera for gig photos | Direct capture |
| Haptic feedback | Touch-specific |
| Offline detection banner | Mobile connectivity |

### Both Platforms
All core features (messaging, songs, setlists, gigs, practice, polls, etc.) are available on both web and mobile.
