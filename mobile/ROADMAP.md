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

### Phase 15 — Feature Completions
- Bulk song import (paste list, parse, import with metadata fetch)
- Song metadata enrichment (fetch missing BPM, key, duration)
- Setlist performers (view/edit who played each setlist)
- Cross-workspace calendar view ("All Bands" toggle in gig list)
- Add gig to device calendar (expo-calendar integration)
- Desktop-only feature hints (Audio Analyzer, Slack Import)

### Phase 16 — Navigation & Admin Parity
- Upcoming event banner (sticky, color-coded by event type, tap to view detail)
- Pinned Calendar shortcut at top of channel list
- Calendar sort order toggle (newest first by default)
- Tap band member to view profile, badges, and stats
- Admin feature parity: gig locking, channel sections, workspace defaults, password reset
- Security hardening: CSP, input validation, Decimal currency precision

### Phase 17 — Performance & New Features
- Message bookmarks (save/unsave, Saved Messages screen, shortcut in channel list)
- Swipe gestures on messages (swipe right to reply, left to quick-react with thumbs up)
- App icon quick actions via expo-quick-actions (Next Gig, New Message, Calendar)
- Image thumbnails generated server-side with sharp for faster loading
- Web: API response caching with TTL, lazy-loaded auth/legal routes, message virtualization (150-message DOM cap)

### Phase 19 — Performance & Gig Enhancements
- API caching with in-memory TTL cache (30-60s depending on resource) with auto-invalidation on mutations
- Component memoization (React.memo on SongCard, SetlistCard with useCallback handlers)
- JSDoc + checkJs for TypeScript-like type checking in JavaScript files
- Gig time fields: sound check, doors open, and stage time (all optional)
- Setlist rename from builder header and context menu
- Mobile calendar time fix (times now save/display correctly)

### Phase 18 — Security Hardening
- Authorization checks on song/setlist/contact/medley delete (creator or admin only)
- Gig media delete authorization (uploader or admin only)
- Gig completion idempotency (prevent duplicate kitty transactions)
- URL injection prevention on gig media, band member images, timeline images
- Socket.IO: room eviction on member removal, payload type validation, maxHttpBufferSize, connection limiting
- Refresh token rotation with reuse detection
- Password complexity requirements (uppercase, lowercase, number)
- JWT secret strength validation at startup
- Input length limits across all route modules
- Zip bomb protection in Slack import
- Sharp decompression bomb limits on image processing
- MIME-based file extensions on upload (ignore user-provided extension)
- Attachment type/size validation, thumbnailUrl validation
- Storage quota underflow protection, required workspaceId on uploads
- Push notification URL validation (prevent open redirect)
- Client-side URL safety checks (prevent javascript: protocol in hrefs)
- Admin rate limiting, error message sanitization, path traversal prevention
- Source maps disabled in production builds
- npm audit fixes (react-router-dom, rollup)

---

## Platform-Specific Features

Some features are intentionally available on only one platform:

### Desktop/Web Only
| Feature | Reason | Mobile Hint |
|---------|--------|-------------|
| Audio Analyzer | CPU-intensive WASM (Essentia.js), file system access | SongDetailScreen shows hint |
| Slack Import Wizard | One-time admin task, large file uploads | SettingsScreen shows hint |

### Mobile Only
| Feature | Reason |
|---------|--------|
| Live Mode (optimized) | On-stage use with phone |
| Device calendar sync | Native calendar integration |
| Camera for gig photos | Direct capture |
| Haptic feedback | Touch-specific |
| Offline detection banner | Mobile connectivity |
| Gig gallery | Browse gig photos |
| Message reporting | Report objectionable content |
| Print & Share setlists | expo-print integration |
| Swipe gestures | Swipe right to reply, left to quick-react |
| Quick actions | 3D Touch / long-press app icon shortcuts |

### Both Platforms
All core features (messaging, songs, setlists, gigs, practice, polls, bulk import, data export, etc.) are available on both web and mobile.

---

## Feature Parity Summary

| Area | Parity | Notes |
|------|--------|-------|
| Messaging | 99% | Full parity — pinned messages, saved messages, link previews, reactions, swipe gestures |
| Songs | 90% | Web has Song Suggestions; both have bulk import |
| Setlists | 85% | Web has advanced drag-drop; mobile has print/share |
| Gigs/Calendar | 90% | Web has month view; mobile has iCal subscribe |
| Members | 95% | Excellent parity |
| Settings | 85% | Mobile has more granular security options |

Last audit: March 2026
