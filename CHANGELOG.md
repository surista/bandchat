# Changelog

All notable changes to BandChat are documented here.

## [1.05.07] - 2026-03-15

### Added
- **All Messages** — Unified cross-channel message feed on web with click-to-navigate to channel. Shows DM participant names.
- **Pin setlists to channels** — Admin can pin a setlist to any channel via header icon. Shows expandable inline banner with numbered song list, key, BPM. Works on web and mobile.
- **Mobile pin setlist UI** — Pin/unpin/change setlists via channel header "..." menu with ActionSheet picker.
- **Expandable pinned setlist** — Click/tap to expand full song list with key (purple) and BPM (blue) badges, MC breaks in yellow. Scrollable, collapses on tap.
- **Poll push notifications** — All workspace members get notified when a new poll is created.
- **Stage plot resize, flip, rotate** — Click any stage plot item to select it and use toolbar controls: scale 50%-300%, horizontal flip, 90° rotation. Transforms saved and included in PDF export.
- **Gig notes on Quick Links** — Hover the upcoming event banner on web to see notes. On mobile, notes show inline. Click opens the gig detail.
- **Error states on 8 mobile screens** — Achievements, Polls, Kitty, Medleys, Stats, Stage Plots, Saved Messages, Invite now show retry on error instead of silent failure.
- **KeyboardAvoidingView on 5 mobile modals** — Announcements, Contacts, Polls, Band Members, Workspace Members password reset.

### Fixed
- **Calendar split sections** — List view now shows UPCOMING (soonest first) and PAST (most recent first) instead of a single sorted list.
- **Push notification toggle broken** — Was reading from deleted localStorage key instead of in-memory token.
- **HTML injection in invite emails** — Workspace names and display names now HTML-escaped.
- **Channel create button missing on mobile** — When all channels were in groups, the "+" button disappeared.
- **Setlist/contact/stage plot authorization** — Added creator-or-admin checks on update/delete.
- **Socket.IO auth soft-delete** — Explicit `deletedAt: null` check instead of relying on middleware.
- **Input validation** — Length limits on song, gig, medley fields (create + update).
- **Fetch timeouts** — 10s timeout on iTunes, YouTube, Deezer, SongBPM API calls.
- **Seed script** — Fixed `type`→`eventType`, `date`→`eventDate` in timeline events.
- **Backup restore** — Channel `pinnedSetlistId`, message `hidePreview`, KittyTransaction `gigId` now preserved. StagePlot added to user purge anonymization.
- **LyricsScreen safe area** — Uses `useSafeAreaInsets()` instead of hardcoded `paddingTop: 50`.
- **Dark mode fixes** — Auth pages, landing page, WorkspaceList, JoinWorkspace, bulk import modal, SongCard hover, ConfirmDialog all themed for dark mode.
- **Settings tabs** — Horizontally scrollable instead of wrapping on mobile.
- **Snooze menu** — Opens above instead of off-screen on mobile.
- **ActionSheet safe area** — Dynamic insets instead of hardcoded `paddingBottom: 34`.
- **Swipe-to-react** — Now works on non-grouped messages (was grouped-only).

### Changed
- **PWA icons** — All icons regenerated from blue flame (was old "B" icon). Favicon, apple-touch-icon, maskable icons all updated.
- **Stage plot instruments** — Guitar, bass, acoustic, drums use real PNG images with transparent backgrounds instead of SVGs.
- **Manifest theme colors** — Updated to dark theme (`#0f1117`).
- **Achievements reseed** — Now requires system admin instead of workspace admin.
- **Storage extension fallback** — Unknown MIME types get `.bin` instead of user-provided extension.

## [1.05.00] - 2026-03-15

### Added
- **Android App Links + iOS Universal Links** — Tapping `bandchat.vercel.app/join/` or `/workspace/` links on mobile opens the app directly instead of the browser. Configured `intentFilters` (Android) and `associatedDomains` (iOS) in app.config.js.
- **`.well-known` verification files** — `assetlinks.json` (Android) and `apple-app-site-association` (iOS) hosted on Vercel for domain verification.
- **Google Play Store subscriptions** — Monthly, annual, and lifetime products created in Play Console. RevenueCat configured with Android app, service account, products, and offerings.
- **Feature graphic** — 1024x500 Play Store feature graphic with blue flame and tagline.
- **RevenueCat Android API key** — Added `EXPO_PUBLIC_REVENUECAT_ANDROID` to mobile env.

### Fixed
- **Invite links not working** — Unauthenticated users clicking `/join/CODE` were redirected to login but the return URL was lost. `PrivateRoute` now passes `state.from` and `PublicRoute` redirects back after login.
- **Deep link handler** — Now accepts `https://bandchat.vercel.app` URLs in addition to `bandchat://` custom scheme. Supports both `/join/` (web) and `/invite/` (custom scheme) paths.
- **Invite code regex** — Was checking for 64-char hex strings but codes are 10-char alphanumeric. Fixed to match actual format.
- **Android icon "icon within icon"** — Regenerated foreground with background removal to eliminate visible inner square from mismatched background colors.
- **Accidentally deleted PWA icons** — Restored all web PWA icons and Android background icon that were lost during icon regeneration.

### Changed
- **New app icon** — Updated to clean blue flame design (no mockup frame) across iOS, Android adaptive (foreground + monochrome), and Play Store (512x512).
- **Guitar/bass stage plot icons** — Replaced hand-drawn SVGs with real instrument PNG images on both web and mobile.

## [1.04.95] - 2026-03-14

### Added
- **Link preview dismissal** — Message authors can remove link previews from their messages (X button on hover/tap). Persists via `hidePreview` field on Message model. Works on web, mobile, and threads.
- **Swipe to react** — Left-swipe on messages to toggle thumbs-up reaction (amber panel). Right-swipe still replies (blue panel). Both in channels and threads.
- **Stage plots** — SVG-based drag-and-drop stage plot editor with 20+ equipment icons, collapsible palette sections, draggable text labels, print/PDF export (web + mobile)
- **Workspace backup/restore** — Per-workspace manual backups to R2 (max 5 per workspace), with full restore including safety backup
- **iPad optimization** — `useLayout()` hook with tablet constraints (700px content, 500px modals) rolled out to all 41 mobile screens
- **Code review fixes** — Filename sanitization on uploads, search rate limiting, sync route hardening, ErrorState with retry on key screens, theme-aware ErrorBoundary

### Fixed
- **Delete message not working** — Action sheet Modal closing animation conflicted with Alert on iOS. Added 350ms delay between Modal close and action dispatch.
- **Home button loops back** — Users with only one workspace couldn't reach the workspace list to join a new workspace. Home button now bypasses auto-navigate.
- **DM names showing raw IDs** — Push notification and deep link navigation to DM channels showed `dm-userId1-userId2` instead of display names. Now resolves member names before navigating.
- **DM display name resolution** — `getDMDisplayName` now prefers the `otherMembers` field from the server response for more reliable name resolution.
- Mobile gig detail missing time display (times showed in calendar list but not detail)
- Account deletion wording clarified — explicitly states it affects all workspaces, not just current one
- Backup system: fixed `pinnedAt` → `createdAt` in PinnedMessage restore, removed invalid `isEdited` field, included soft-deleted records, added concurrency guard
- Sync routes: fixed socket room names, added type validation and rate limiting
- LiveModeScreen: replaced hardcoded `top: 50` with `useSafeAreaInsets()`
- Admin: workspace backup path traversal validation, generic error messages

### Changed
- Extracted `formatDuration` and `getInitial` utility functions to reduce code duplication
- Migrated 12 web modals to reusable `Modal.jsx` component
- Standardized empty states across web components

## [1.04.59] - 2026-03-11

### Added
- **Gig time fields** — Sound check, doors open, and stage times for gigs (all optional)
- **Setlist rename** — Edit setlist names inline in the builder header or via context menu/card actions
- **Mobile API caching** — In-memory TTL cache for API responses with auto-invalidation on mutations
- **Memoization** — React.memo on SongCard and SetlistCard components with useCallback handlers
- **JSDoc + checkJs** — TypeScript-like type checking for JavaScript files via tsconfig.json

### Fixed
- **Mobile calendar times** — Times now save and display correctly (embedded in datetime fields)
- **Message text selection** — Users can now select and copy message text on web
- **Duplicate function name** — Fixed build error from handleDeleteSong naming conflict

### Changed
- Gig form shows 3 optional time fields (Sound Check, Doors, Stage Time) for GIG type events only
- Mobile gig detail screen displays all time fields when set

## [1.04.49] - 2026-03-09

### Added
- **Soft-delete system** for users and workspaces — 30-day grace period before permanent deletion
- Prisma middleware auto-filters soft-deleted records from all queries (no per-file changes needed)
- Admin dashboard "Deleted Items" tab with restore and purge actions
- Admin API endpoints: list deleted, restore users/workspaces, purge users/workspaces
- Daily scheduled purge job for records past the 30-day grace period
- R2 file cleanup on workspace purge
- **Demo workspace seeder** — `seed-demo-workspace.js` creates "Lunar Moth" band with 6 members, 460+ messages, songs, setlists, gigs, and all features populated
- Former/guest band member support in demo data (member leaves, guest fills in, member returns)

### Fixed
- Hardcoded ¥ currency symbol in Gig Archive and Calendar — now uses workspace currency setting
- Revenue showing as concatenated string instead of sum (Prisma Decimal → Number conversion)

### Changed
- User account deletion now soft-deletes (sets `deletedAt`, revokes tokens) instead of immediate hard-delete
- Workspace deletion now soft-deletes instead of immediate hard-delete
- Auth middleware returns 401 "Account has been deleted" for soft-deleted users
- Workspace delete emits `workspace:deleted` socket event to all members
- Updated all documentation (CLAUDE.md, README.md, CHANGELOG.md)

## [1.04.47] - 2026-03-09

### Changed
- New app icon (blue flame on dark background)
- Fix swipe reply/react UX — debounce, toggle behavior, improved thresholds

## [1.04.46] - 2026-03-08

### Fixed
- Server crash: define missing `validateUrl` SSRF function in linkPreview route
- Message channel crash: replace deprecated `Swipeable` with `ReanimatedSwipeable` from react-native-gesture-handler
- Remove `react-native-purchases` from Expo plugins array (no config plugin needed)

### Changed
- Migrate from expo-iap to RevenueCat SDK for in-app purchases

## [1.04.45] - 2026-03-08

### Changed
- Migrate from expo-iap to RevenueCat (`react-native-purchases`) for subscription management
- RevenueCat initialized in AuthContext, UpgradeScreen uses `Purchases.getOfferings()`
- Server-side RevenueCat helper and webhook support

## [1.04.44] - 2026-03-07

### Fixed
- Upload 500 error caused by Serializable transaction isolation
- Saved messages using `Channel.type` instead of `isDirect`

## [1.04.42] - 2026-03-07

### Added
- Web client plan gating — feature locks for free-tier workspaces
- Settings plan tab showing current plan, usage, and upgrade options
- Theme locking for free tier
- UpgradePrompt component for gated features

## [1.04.41] - 2026-03-06

### Added
- Subscription system — per-workspace FREE/PRO plans
- Plan enforcement with configurable limits (storage, members, songs, features)
- Plan limits module (`planLimits.js`)

## [1.04.40] - 2026-03-06

### Added
- Saved messages (bookmarks) — privately bookmark messages for quick reference
- Swipe gestures on mobile (swipe right to reply, left to quick-react)
- App icon quick actions (3D Touch / long-press)

### Changed
- Security hardening across the platform
- Performance optimizations

## [1.04.39] - 2026-03-05

### Added
- Upcoming event banner (sticky on mobile) showing next gig/rehearsal
- Pinned Calendar shortcut in sidebar

## [1.04.37] - 2026-03-05

### Added
- Calendar sort order toggle
- Mobile member profile tap navigation

## [1.04.33] - 2026-03-04

### Added
- Admin auto-elevation when last admin leaves workspace

### Fixed
- Decimal currency handling for band kitty

## [1.04.30] - 2026-03-04

### Added
- CSP hardening
- Input length validation on all string fields across all route modules
- Currency precision (Decimal type for financial fields)

## [1.04.29] - 2026-03-04

### Added
- Mobile admin feature parity: gig locking, channel sections, workspace defaults

## [1.04.27] - 2026-03-03

### Added
- Per-workspace currency setting
- Message density options
- Admin authorization guards on all destructive operations

## [1.04.11] - 2026-03-03

### Added
- App Store launch preparations
- Content moderation (reporting and blocking)
- Account deletion (Settings > Security > Delete My Account)
- GDPR compliance features
- Accessibility labels (520+ props across 35 mobile files)
- Privacy policy and Terms of Service pages

## [1.04.05] - 2026-03-03

### Added
- Automated R2 database backups with verification
- Admin backup restore with safety backup
- Workspace import from backup

## [1.04.00] - 2026-03-02

### Changed
- httpOnly cookie authentication for web (refresh tokens)
- Resilient token refresh with rotation and reuse detection

### Added
- Gig archive (completed/cancelled gig history)

## [1.03.81] - 2026-03-02

### Added
- **Practice Dashboard (Web)**: View your practice history, streaks, and stats on the web. Log practice sessions from Songs, track your day streak, total time, and session count. Sessions grouped by date with delete support.
- **Improved Empty States**: All major list views (Songs, Setlists, Gigs, Contacts, Polls, Announcements, Medleys, Recordings) now feature helpful empty states with icons, descriptions, and action buttons.
- Push notification deep-linking to specific channels/threads

## [1.03.66] - 2026-03-01

### Changed
- Audit v4 — httpOnly cookies, token hashing, async song imports
- Verification/reset tokens SHA-256 hashed before DB storage

## [1.03.62] - 2026-02-28

### Added
- 12 new features:
  - Gig gallery (photo/video per gig)
  - Live mode for setlists during performances
  - iCal feed for calendar subscriptions
  - Practice tracker with streaks
  - Voice messages
  - Band member timeline
  - Achievements system
  - Availability calendar
  - Band kitty (shared finances)
  - Contacts management
  - Announcements with expiry
  - Polls/voting

## [1.02.13] - 2026-01-21

### Added
- **Cross-workspace calendar**: Toggle "Other Bands" to see calendar events from all your workspaces. External events display with muted colors and dashed borders, showing workspace name on hover.
- **Time ranges on calendar**: Events now show start-end times (e.g., 19:00-21:00) in both calendar and list views.
- **Delete button in event form**: Can now delete events directly from the edit form.
- **12-hour time picker**: Time input uses 12-hour format with AM/PM toggle, minutes limited to :00 and :30.
- **Keyboard navigation**: Use left/right arrow keys to navigate between months in calendar view.

### Fixed
- **Copy event preserves time**: Duplicating an event now preserves the original start/end times, venue, and all other details.

## [1.02.00] - 2026-01-20

### Added
- **Multi-set setlists**: Gigs can now have multiple setlists (Set 1, Set 2, Set 3) displayed in columns on desktop.
- **Drag-and-drop between sets**: Move songs between different sets in the setlist builder.
- **Resizable setlist panels**: Drag to resize the setlist panel and individual set columns.
- **Copy setlists**: Duplicate setlists for reuse with the copy button.
- **Drag-and-drop calendar**: Drag events to new dates with Move/Copy dialog.
- **Edge scrolling**: Drag events to calendar edges to navigate between months.
- **Copy calendar events**: Duplicate gigs and rehearsals to new dates.

### Fixed
- **Cross-set drag collision**: Fixed drag-and-drop not reaching Set 3 by using pointer-based collision detection.

## [1.01.00] - 2026-01-15

### Added
- **Song metadata fetching**: Auto-fetch BPM, key, and duration from SongBPM.com.
- **Mobile navigation**: Bottom navigation bar for mobile devices.
- **Sidebar padding**: Added bottom padding to prevent mobile nav overlap.

### Fixed
- **API rate limiting**: Increased rate limit and added delays to metadata fetching.

## [1.00.00] - 2026-01-01

### Initial Release
- Real-time messaging with channels and direct messages
- Thread replies and emoji reactions
- File/image sharing (up to 10MB)
- Song repertoire management with metadata
- Drag-and-drop setlist builder
- Calendar for gigs, rehearsals, and recording sessions
- Push notifications
- Google Sign-In authentication
- Workspace management for multiple bands
