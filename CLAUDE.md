# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## Design & Development Standards (Reusable Across Projects)

> Copy this section into any project's CLAUDE.md to enforce consistent quality standards.

### Design Philosophy

UI/UX quality is the top priority. Every screen, every interaction, every pixel should feel intentional and polished. No placeholder UI, no "good enough" — every commit should look ready to ship.

### iOS / Mobile Standards

Follow the [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) strictly. When in doubt, do what a native Apple app would do.

- **Native patterns first**: Use platform-native components (NavigationStack, TabView, sheets, alerts) over custom implementations. Never build a custom control when a system one exists.
- **SF Symbols**: Use SF Symbols for all icons — no third-party icon libraries.
- **Typography**: Use the system font stack. Support Dynamic Type with `maxFontSizeMultiplier` on all text. Test that layouts don't break at large accessibility sizes.
- **Layout**: Respect safe areas. Use standard margins (16pt). Design adaptive layouts that work across all iPhone sizes and iPad (regular/compact width). Use SwiftUI/Auto Layout to handle orientation and multitasking.
- **Touch targets**: Every interactive element must be at least 44×44pt.
- **Haptic feedback**: Use context-appropriate haptics (selection, light/medium/heavy impact, success, warning, error). Haptics should feel meaningful, not gratuitous.
- **Animations**: Use system animation curves and spring physics. Transitions should feel physically natural. Prefer `LayoutAnimation` and system-provided transitions over manual animation.
- **Dark Mode**: Full support required. Test every screen in both modes. Use semantic/system colors wherever possible.
- **Accessibility**: VoiceOver labels on all interactive elements. Group related content logically. Ensure sufficient color contrast. Never rely on color alone to convey meaning.
- **States**: Every data-driven view must handle loading, empty, error, and populated states. Empty states should include a clear CTA.
- **Navigation**: Follow iOS conventions — large titles where appropriate, standard back buttons, swipe-to-go-back, modal presentation for focused tasks.
- **Keyboard handling**: Use `KeyboardAvoidingView` or equivalent on all input screens. Inputs should never be obscured by the keyboard.

### Web / PWA Standards

Build for a professional, clean, fully responsive experience across all screen sizes.

- **Responsive first**: Every layout must work seamlessly from 320px mobile to ultrawide desktop. Use fluid grids, relative units, and breakpoints. Test at common breakpoints (375, 768, 1024, 1440).
- **Reactive UI**: All interactions should feel immediate. Use optimistic updates, loading skeletons, and smooth transitions. No jarring layout shifts.
- **Clean and professional**: Restrained, purposeful design. Consistent spacing, alignment, and typography. Avoid visual clutter.
- **Progressive enhancement**: Core functionality must work without JavaScript where feasible. Offline support via Service Worker for PWAs.
- **Performance**: Minimize layout shifts (CLS). Lazy-load non-critical content. Keep bundle sizes lean. Aim for 90+ Lighthouse scores.
- **Accessibility (web)**: Semantic HTML, ARIA labels where needed, keyboard navigation for all interactive elements, visible focus indicators, sufficient contrast ratios (WCAG AA minimum).
- **Cross-browser**: Test in Safari, Chrome, and Firefox. Don't rely on vendor-specific features without fallbacks.

### General Code Quality

- **Error handling**: Non-critical errors should never block the user. Surface errors gracefully with clear messaging and recovery paths.
- **Consistency**: Follow existing code patterns in the project. Check neighboring files before introducing new patterns.
- **Security**: Sanitize all user input. Validate on both client and server. Use secure storage for sensitive data.
- **Commits**: Clear, descriptive commit messages. No Co-Authored-By lines.

---

## Project: BandChat

BandChat is a real-time communication and management app for bands — like Slack, but built specifically for musicians. It features channels, direct messages, song/setlist management, calendar scheduling, push notifications, subscriptions, and a native mobile app.

### Build Commands

#### Client (React frontend)
```bash
cd client
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run bump:patch   # Increment patch version (updates all 3 package.json + app.config.js)
```

#### Server (Express backend)
```bash
cd server
npm run dev          # Start with nodemon (hot reload, port 3001)
npm run start        # Production start (with db push)
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

#### Mobile (Expo/React Native)
```bash
cd mobile
npx expo start       # Start Expo dev server
npx expo start --ios # iOS simulator
npx expo start --android # Android emulator
eas build --platform ios --profile production    # Build iOS for TestFlight/App Store
eas build --platform android --profile production # Build Android for Play Store
```

### Code Architecture

#### Project Structure
```
bandchat/
├── client/                     # React web frontend
│   ├── src/
│   │   ├── components/         # 83 components across 9 subdirectories
│   │   │   ├── auth/           # Login, Signup, GoogleSignInButton, ForgotPassword, ResetPassword, VerifyEmailChange
│   │   │   ├── band/           # 22 components: Songs, Setlists, Calendar, Stats, Live Mode, Practice, etc.
│   │   │   ├── channels/       # Sidebar, ChannelView, ChannelMembersPanel, SettingsModal, PinnedMessages, NewMessage
│   │   │   ├── common/         # 12 shared: ConfirmDialog, ContextMenu, ErrorBoundary, ImageLightbox, Modal, Skeleton, etc.
│   │   │   ├── legal/          # PrivacyPolicy, TermsOfService, Support
│   │   │   ├── messages/       # MessageList, MessageInput, LinkPreviewCard, ReactionDisplay, ReactionPicker, SavedMessages
│   │   │   ├── navigation/     # MobileNav
│   │   │   ├── threads/        # ThreadView
│   │   │   └── workspaces/     # WorkspaceList, WorkspaceView, SlackImportWizard, OnboardingWizard, JoinWorkspace, WorkspaceImportWizard
│   │   ├── context/            # AuthContext, SocketContext, ThemeContext, ToastContext
│   │   ├── hooks/              # useLongPress, useOnlineStatus, useSwipeGesture
│   │   ├── services/           # api, badge, haptic, nativeApp, nativePush, platform, push
│   │   └── styles/             # Tailwind CSS
│   └── package.json
├── mobile/                     # Expo/React Native mobile app
│   ├── src/
│   │   ├── screens/            # 55 screens organized by feature
│   │   ├── components/         # 18 shared: ActionSheet, Badge, DraggableList, EmojiPicker, MessageBubble, PressableRow, etc.
│   │   ├── context/            # AuthContext, SocketContext, ThemeContext, ToastContext
│   │   ├── services/           # ApiService (~1700 lines, with in-memory TTL cache)
│   │   └── utils/              # 10 utilities: formatDate, haptics, parseMentions, urlSafety, buildSetlistHTML, prepareImageUpload, etc.
│   ├── app.config.js           # Expo config with permissions
│   ├── eas.json                # EAS Build profiles (dev/preview/production)
│   └── package.json
├── server/                     # Express backend
│   ├── src/
│   │   ├── routes/             # 33 route modules
│   │   ├── middleware/         # auth.js (JWT + role checks), rateLimit.js (per-route), requestId.js
│   │   ├── admin/              # System admin dashboard (standalone HTML/CSS/JS, not bundled)
│   │   ├── services/           # 8 services: backup, itunes, youtube, spotify, deezer, songbpm-scraper, slackTextConverter, slackEmojiMap
│   │   ├── socket/             # handlers.js — real-time event handlers
│   │   ├── scripts/            # CLI utilities: import-slack, seed-test-workspace, generate-slack-mapping, etc.
│   │   └── lib/                # 7 modules: prisma (with soft-delete middleware), storage (R2), validateUrl, validators, planLimits, revenuecat, icsParser
│   ├── prisma/
│   │   └── schema.prisma       # Database schema (56 models, 8 enums)
│   └── package.json
├── CLAUDE.md                   # AI assistant instructions (this file)
├── CHANGELOG.md                # Version history
└── README.md                   # Project overview
```

### Tech Stack

**Client (Web):**
- React 18 with React Router
- Vite 6 (build tool)
- Tailwind CSS
- Socket.IO Client
- Google OAuth (`@react-oauth/google`)

**Mobile:**
- Expo SDK ~54 / React Native
- React Navigation (native-stack)
- Ionicons (`@expo/vector-icons`) for all UI icons — use outline variant for default state, filled for selected/active
- Expo Calendar, Contacts, Haptics, Notifications, Image Picker
- RevenueCat (`react-native-purchases`) for in-app subscriptions
- EAS Build for iOS/Android

**Server:**
- Express 4 / Node.js
- Prisma ORM with PostgreSQL (56 models, 8 enums)
- Socket.IO (real-time messaging)
- JWT Authentication (access tokens + httpOnly cookie refresh tokens)
- Cloudflare R2 (file uploads via @aws-sdk/client-s3, with magic byte validation and MIME-based extensions)
- Web Push Notifications (VAPID)
- Resend (transactional email)
- Sharp (server-side image thumbnails)
- cookie-parser, Helmet + CSP, rate limiting (per-route: auth, refresh, admin)
- JWT secret strength validation at startup
- Socket.IO hardening (maxHttpBufferSize, payload validation, connection limiting, room eviction)

### Database Schema (56 models)

**Core:** User, RefreshToken, Workspace, WorkspaceMember, Channel, ChannelGroup, ChannelMember
**Messaging:** Message, Attachment, Reaction, ThreadRead, PinnedMessage, SavedMessage, PushSubscription, ExpoPushToken, Mention
**Music:** Song, SongAttachment, Setlist, SetlistSong, SetlistSongNote (per-user personal annotations on a setlist song), SetlistPerformer, Medley, MedleySong, Recording
**Gigs:** Gig, GigAttendee, GigSetlist, GigMedia, GigSong, GigComment
**People:** BandMember, InstrumentStint, MemberAvailability, Contact, BlockedUser, Venue
**Community:** Announcement, AnnouncementAcknowledgment, Poll, PollOption, PollVote, TimelineEvent
**Achievements:** Achievement, MemberAchievement, BandAchievement
**Finance:** BandKitty, KittyTransaction
**Stage Plots:** StagePlot
**Website:** SongRequest, ContactSubmission, WebsiteApiToken
**Platform:** AuditLog, Report, PracticeSession

**Enums:** Role, AttachmentType, SetlistItemType, GigType, GigStatus, AttendeeStatus, AvailabilityStatus, KittyTransactionType

### Key Features
- Real-time messaging with channels, DMs, threads, reactions, voice messages, and saved messages (bookmarks)
- File/image (15MB, iPhone HEIC auto-transcoded to JPEG)/audio (500MB)/video (500MB) sharing with auto-generated thumbnails, link previews (dismissible by author), and photo gallery (up to 5 attachments per message)
- Stage plot editor with drag-and-drop equipment icons, text labels, and PDF export (web + mobile)
- Song repertoire with bulk import, async metadata enrichment (iTunes/Spotify/Deezer/YouTube/SongBPM), and lyrics
- Drag-and-drop setlist builder with MC sections, medleys, and PDF export
- Calendar for gigs/rehearsals with device calendar sync, iCal feed, and optional time fields (sound check, doors, stage)
- Event comments (any workspace member posts, authors edit their own, admins can delete any; personal events restrict comment visibility to creator + admins; real-time via Socket.IO with push notifications)
- Comment count badges surface on calendar rows, list cards, and the upcoming-event banner
- Upcoming event banner with pinned Calendar shortcut in sidebar
- Gig attendance tracking, completion, history, and live mode
- Practice tracker with streaks and timezone-aware calculations
- Band member timeline, availability, and achievements
- Band kitty (shared finances), contacts, announcements (with expiry), polls
- Slack workspace import (channels, messages, threads, reactions, gigs)
- Push notifications, 20+ themes, dark/light mode, system theme sync
- Soft-delete for users and workspaces (30-day grace period, admin restore/purge)
- Account deletion, data export, workspace export
- Per-workspace subscriptions (FREE/PRO) via RevenueCat
- Onboarding wizard for new workspaces
- System admin dashboard with user/workspace management, storage, backups, and deleted items

### Server Routes (33 modules)
achievements, admin, announcements, auth, availability, bandMembers, blocks, channelGroups, channels, contacts, gigs, kitty, linkPreview, medleys, messages, polls, practice, push, recordings, reports, setlists, slackImport, songs, stagePlots, subscriptions, suggestions, sync, timeline, uploads, venues, website, workspaceImport, workspaces

### Server Background Jobs
- **Token cleanup** — Expired refresh tokens purged every hour
- **Database backup** — Daily to R2 with verification (60s after start, then every 24h). Retention: 7 daily + 4 weekly
- **Soft-delete purge** — Users/workspaces with `deletedAt` > 30 days are permanently deleted daily (2min after start, then every 24h). Users are anonymized before hard delete; workspace R2 files are cleaned up

### Environment Variables

See README.md for full list. Required:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` - Cloudflare R2 storage
- `VAPID_*` - Push notification keys
- `GOOGLE_CLIENT_ID`
- `RESEND_API_KEY` - Transactional email
- `REVENUECAT_SECRET_KEY` / `REVENUECAT_WEBHOOK_SECRET` - RevenueCat subscriptions

Legacy (still accepted for existing URLs): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`

### File Storage (Cloudflare R2)

- New uploads go to Cloudflare R2 via `server/src/lib/storage.js` (S3-compatible API)
- Legacy Cloudinary URLs still work — URL validation accepts both domains (`server/src/lib/validateUrl.js`)
- Per-workspace storage tracking: `Workspace.storageUsedBytes` (BigInt, incremented on upload, decremented on delete with underflow protection)
- Storage quota enforcement: checked before upload in `uploads.js` (default 2GB per workspace, workspaceId required)
- R2 file cleanup: when records are deleted (messages, recordings, songs, gig media), the R2 file is also deleted
- Server-side thumbnails: `sharp` generates 400px-wide thumbnails stored in R2 `thumbnails/` folder
- Orphan detection: admin dashboard can scan for R2 files with no matching DB record
- Admin endpoints: `/api/admin/storage/stats`, `/api/admin/storage/orphans`, `/api/admin/storage/cleanup`, `/api/admin/storage/recalculate`

### Soft-Delete System

Users and workspaces are soft-deleted with a 30-day grace period before permanent removal.

#### How It Works
- **Prisma middleware** (`server/src/lib/prisma.js`) auto-injects `deletedAt: null` into all User/Workspace queries — no changes needed in 40+ query locations
- **Bypass**: Any query that explicitly includes `deletedAt` in its where clause (e.g. `{ deletedAt: { not: null } }`) skips the auto-filter — used by admin routes
- `findUnique` calls are transparently converted to `findFirst` with the `deletedAt: null` filter added

#### User Deletion Flow
1. User requests account deletion → `deletedAt` set, refresh tokens revoked, force logout
2. User cannot log in (auth middleware checks `deletedAt`)
3. Messages and content remain intact during grace period (author info preserved)
4. After 30 days: messages anonymized (`removedUserName` set, `authorId` nulled), user hard-deleted
5. System admin can restore or purge early from the admin dashboard

#### Workspace Deletion Flow
1. Admin deletes workspace → `deletedAt` set, `workspace:deleted` socket event emitted
2. Workspace hidden from all queries (middleware filter)
3. After 30 days: R2 files cleaned up, workspace cascade-deleted
4. System admin can restore or purge early from the admin dashboard

#### Admin Endpoints
- `GET /api/admin/deleted` — List soft-deleted users and workspaces with days remaining
- `POST /api/admin/users/:id/restore` — Restore a soft-deleted user
- `POST /api/admin/workspaces/:id/restore` — Restore a soft-deleted workspace
- `DELETE /api/admin/users/:id/purge` — Permanently delete immediately
- `DELETE /api/admin/workspaces/:id/purge` — Permanently delete immediately (with R2 cleanup)

### Deployment

- **Server**: Railway (Node.js service, auto-deploys from `main`)
- **Client**: Vercel (static site, auto-deploys from `main`)
- **Database**: Railway PostgreSQL
- **Mobile**: EAS Build (Expo Application Services) for iOS/Android

### Git Commit Rules

- NEVER add "Co-Authored-By" lines to commits
- Keep commit messages short and descriptive
- Always prefix with version number (e.g. "v1.04.48 Add soft-delete")

### Admin Roles

BandChat has two distinct admin concepts:

| Role | Scope | Field | Purpose |
|------|-------|-------|---------|
| **System Admin** | Platform-wide | `User.isSystemAdmin` | Developer/ops access: admin dashboard at `/admin`, user management, platform stats, backups, deleted items |
| **Workspace Admin** | Per workspace | `WorkspaceMember.role = 'ADMIN'` | Band leader: manages members, invites, settings, announcements, gig locking |

- The `/admin` dashboard is a standalone HTML page served by Express — never bundled into client or mobile
- System admin routes are at `/api/admin/*` and protected by `isSystemAdmin` middleware
- Workspace admin routes use `isWorkspaceAdmin` middleware
- The two roles are independent: a system admin is not automatically a workspace admin (and vice versa)

#### Admin Dashboard Tabs
1. **Overview** — User, workspace, message counts with 7d/30d trends, active users, auth providers
2. **Users** — Searchable user list, detail modal, toggle system admin
3. **Workspaces** — Searchable workspace list with member/channel/message/storage counts
4. **Storage** — R2 stats, per-workspace usage, orphan scan + cleanup, recalculate
5. **Backups** — List/download/restore backups, manual backup trigger
6. **Deleted** — Soft-deleted users/workspaces with restore and purge actions

### Subscription System

- **Plan model**: Per-workspace FREE/PRO, `getEffectivePlan()` checks expiry at read time
- **Limits**: `server/src/lib/planLimits.js` defines per-plan limits (storage, members, songs, etc.)
- **RevenueCat**: Mobile in-app purchases via `react-native-purchases` SDK
- **Product IDs**: `bandchat_pro_monthly`, `bandchat_pro_annual`, `bandchat_pro_lifetime`
- **Server**: `server/src/lib/revenuecat.js` helper, activate endpoint + webhook in `subscriptions.js`
- **Grandfathered**: Existing workspaces set to PRO (`planSource: MANUAL`, `planExpiresAt: null`)

### Development Notes

- **Mobile touch targets**: use `MIN_TOUCH_TARGET` from `mobile/src/utils/touchTarget.js` (44 on iOS, 48 on Android — matches each platform's spec) instead of hardcoded numbers.
- **Audio playback**: AudioAttachment uses a module-level `audioPauseListeners` Set to coordinate one-at-a-time playback across multiple audio bubbles in the same channel. If you add a second audio player component, register it with the same broadcast.
- **Notification channels** (Android): each has a distinct `vibrationPattern` so users feel the difference between a mention (`[0, 400, 120, 400]`), a regular message (`[0, 250, 150, 250]`), and an event/announcement (`[0, 350]`). Keep this pattern when adding new channels.
- **Theme mode** is now `auto | light | dark` on mobile. `useTheme()` returns both `modeSetting` (user's pick) and the resolved `mode`. When you read for branching, use `mode`. When you write, use `setModeSetting`.
- **Deferred UI items** (low priority, captured here so they're not re-discovered). Verified against the tree as of the July 2026 review — several entries from the June pass were already done and have been removed, so trust this list over memory but re-check before starting:
  - **`accessibilityViewIsModal`**: down to a single holdout, `WorkspaceListScreen.js`. Pattern: add it to the inner sheet `Pressable`/`View`, not the outer overlay.
  - **ActionSheet migration**: 9 screens still hand-roll a bottom sheet with a custom `Modal` instead of the `<ActionSheet>` component (which routes to `ActionSheetIOS.showActionSheetWithOptions` for a native UIAlertController on iOS): `SecurityScreen`, `SettingsScreen`, `SetlistDetailScreen`, `SongIntelligenceScreen`, `RecordingDetailScreen`, `SongDetailScreen`, `GigListScreen`, `WorkspaceListScreen`, `ChannelSettingsScreen`. Migrate 1–2 per PR.
  - **First-unread scroll position** (`ChannelScreen.js`): the one-shot jump uses `viewPosition: 0.5`, centering the "New messages" divider so half the viewport is already-read history. iOS chat convention pins it nearer the top so unread content fills the screen. The list is `inverted`, which flips the `viewPosition` axis (`1` ≈ visual top) — verify on a device before changing, there's no other inverted `scrollToIndex` in the codebase to pattern-match against.
  - **Typed `Message` shape**: the Message object passes through Socket / SQLite / UI / api.js with implicit shape. The v1.07.06/07 thread-reply count fixes and v1.07.18 dedupe fixes all clustered around this surface. If introducing TypeScript incrementally, convert `Message` first.
  - Done since the June pass (do not re-file): per-screen `ErrorBoundary` (now via the `layout` prop in `AppStack.js`), `Switch trackColor`, `KeyboardAvoidingView behavior` on Android, and the `keyboardDismissMode` sweep for ScrollViews containing text input.

- **Refresh tokens are single-use and rotate with no grace period.** `POST /api/auth/refresh` deletes the presented token and issues a new one, so two refreshes racing on the same token means the loser gets `401 "Refresh token has been revoked"` — which both clients treat as a definitive auth failure (`clearTokens()`, then bounce to login). Deduplication therefore lives **inside** `refreshAccessToken()` on both platforms (`client/src/services/api.js`, `mobile/src/services/api.js`), not in the callers — never call the underlying refresh directly, and never "helpfully" add a caller-side lock instead. This caused the v1.07.39 web login loop (the socket's `connect_error` handler re-fires on every reconnect attempt and was launching a burst of unsynchronized refreshes) and, earlier, mobile logouts on app resume.
  - **Still open:** dedup is per-client-instance, so two browser tabs — or web and mobile together — can still race. The real fix is a short server-side reuse-grace window on rotation, which needs a schema change. Worth doing if logout-loop reports resurface.
  - Server restarts (every Railway deploy) drop all sockets at once, and the resulting reconnect storm is exactly the burst that surfaces races like this. Suspect it when auth weirdness clusters right after a deploy.
- CSS should go in `/client/styles/` CSS files
- JavaScript code in `/client/src/` and `/server/src/`
- The Sidebar.jsx component is large (~1300 lines) — contains channel management and workspace UI (settings moved to SettingsModal.jsx)
- Database uses cascade deletes on workspace relations
- Prisma middleware auto-filters soft-deleted records — no need to add `deletedAt: null` manually
- Song metadata enrichment: async two-phase (create immediately, enrich via Socket.IO background) using iTunes, Spotify, Deezer, YouTube, SongBPM
- API caching (mobile): in-memory Map with TTL in ApiService, auto-invalidated on mutations
- Bundle splitting: auth/legal routes lazy-loaded via `lazyRetry()` in App.jsx
- Message rendering: `MessageList` renders all loaded messages — no DOM cap. The earlier 150-message cap (removed in v1.06.60) silently dropped older paginated messages because `slice(-150)` always cuts from the start. If perf becomes an issue at extreme channel sizes (~5,000+ messages), introduce proper windowed virtualization (`react-window` / `react-virtuoso`) that respects scroll position. Do NOT reintroduce a naive "keep latest N" cap — it's worse than no cap because it actively breaks scroll-back correctness.
- **`MessageList` row memoization (shipped v1.06.71):** `MessageRow` is a memoized component at module scope. Per-row state is passed as primitives (`isPinned: boolean`, `isSaved: boolean`, `isEditing: boolean`, etc.) so `React.memo`'s default shallow comparison short-circuits unchanged rows. Handlers + reference data are bundled into a `ctx` object memoized at the parent. Socket handlers in `ChannelView` use `prev.map(m => m.id === id ? {...m, ...} : m)` so unchanged messages keep their object reference, which is what makes the memo bypass kick in. **If you add new state/handlers to MessageList that the row uses, add them to `ctx` (and its useMemo deps) and useCallback the handler — otherwise you'll silently bust the memo and reintroduce the re-render storm.** If you ever add per-row state that changes frequently (e.g. typing animations), pass it inline as a primitive prop, not via ctx.
- Message pagination: cursor is the message id (UUID, 36 chars) of the oldest visible message. Server validates with `isValidUUID()` from `server/src/lib/validators.js` — never with a length range. `ChannelView` triggers `loadMoreMessages` from BOTH an `IntersectionObserver` AND a scroll listener (`scrollTop < 100`); the latter is the actual workhorse — observer alone is unreliable because it only fires on enter and won't retry after a transient failure.
- HTTP caching on `/api/messages/*`: a `router.use` middleware sets `Cache-Control: no-store` on every response. Required because the data mutates constantly and Express's default `ETag` revalidation caused 304 cache poisoning during the 2026-04-25 rate-limit incident — empty bodies got cached and the client's `hasMore` stuck at `false` permanently. Don't remove this header without a virtualization/pagination redesign.
- Rate limiter: `apiLimiter` runs as `app.use('/api', apiLimiter)` BEFORE per-route `authenticate`, so it can't read `req.user` at limiter time. To get per-user buckets it decodes the JWT inline via `userKey()` in `server/src/middleware/rateLimit.js` (validates `JWT_SECRET`/HS256, returns `u:<userId>` or falls back to `req.ip` for anonymous endpoints). Cap is 5000/15min/user; OPTIONS preflights are skipped.
- iPhone HEIC photo uploads: transcode on-device to JPEG via `expo-image-manipulator` — always route picker results through `mobile/src/utils/prepareImageUpload.js` before calling `api.uploadFile`. Server also accepts `image/heic`/`image/heif` as a belt-and-suspenders fallback; `generateThumbnail` silently produces no thumbnail when libvips lacks libheif
- Gig comment audience: use `resolveCommentAudience(gig)` + `emitCommentEvent()` in `server/src/routes/gigs.js` whenever emitting comment events or sending push — returns null for workspace broadcast or an explicit userId list when `gig.isPersonal`
- iPad split view is gated behind `useLayout().isSplitView` (iPad + `width >= 720`), which covers common Stage Manager / Split View widths
- **Persistent UI state must go through the storage wrappers, not raw `localStorage`/`AsyncStorage`.** Web: `import { storage } from 'services/storage'` — exposes `getString`/`setString`/`getNumber`/`setNumber`/`getBool`/`setBool`/`getJSON`/`setJSON`/`remove`. Mobile: `import { getUiState, setUiState, getUiString, setUiString, removeUiState } from 'services/storage'`. Both swallow errors and return safe defaults — required because Safari private mode throws `QuotaExceededError` on `setItem` and a single unwrapped throw blanks the screen via the error boundary. Mobile `services/storage.js` also exports a `storage` default for SecureStore-backed auth tokens with AsyncStorage fallback — that one is for tokens only, not UI state.
- **New server routes should prefer `ApiError` + `asyncHandler`** from `server/src/lib/apiError.js`. Throw `new ApiError(404, 'Not found', { code: 'NOT_FOUND' })` instead of writing `try / console.error / res.status().json()` blocks. The global error handler in `app.js` formats it, includes `requestId` in the body, and only logs 5xx at error level. Existing routes' try/catch patterns still work — there is no migration in progress, this is for new code.
- **Free-form text validation:** use `checkText(value, label, max, { required, minTrim })` and `TEXT_LIMITS` (NAME/TITLE/LABEL/URL/SHORT_TEXT/LONG_TEXT/MESSAGE_BODY/LYRICS) from `server/src/lib/validators.js` instead of inlining magic numbers. Most routes are already covered with per-field caps — only `stagePlots.js` was missing one as of v1.06.96.
- **Setlist exports** (PDF + Word, web only): shared HTML builder at `client/src/utils/setlistExport.js` — `buildSetlistHtml()` / `printSetlist()` / `exportSetlistAsWord()`. Both Print and Word use the same HTML; only the output mechanism differs (popup + `window.print()` vs. `Blob` download with `application/msword`). Pass `notes` (a `{ [setlistSongId]: { content } }` map) to include per-user personal annotations. The notes themselves live in `SetlistSongNote` server-side and are fetched via `api.getMySetlistNotes(setlistId)`. No `docx` library required — Word opens HTML-with-BOM transparently.

### Web + Mobile Parity

**IMPORTANT:** The web client (`client/`) and mobile app (`mobile/`) are parallel frontends for the same backend. When making changes, ALWAYS consider whether the change applies to both platforms:

- **UI features** (show/hide password, footer links, currency formatting, etc.) — apply to BOTH web and mobile
- **Bug fixes** in display logic, formatting, or data handling — check BOTH platforms for the same issue
- **New API fields** returned by the server — update BOTH web and mobile to use them
- **Server-side changes** (new endpoints, response shape changes) — update BOTH clients that consume them

Before marking a task as complete, ask yourself: "Does the other platform need this change too?" If the answer is yes or maybe, apply it to both in the same commit.

### Platform-Specific Features

While most features should exist on both web and mobile, some features make sense on only one platform due to device capabilities or use context.

#### Desktop/Web Only
These features work better with a keyboard, mouse, or larger screen:

| Feature | Rationale | Mobile Hint |
|---------|-----------|-------------|
| **Audio Analyzer** | CPU-intensive WASM (Essentia.js), needs file system access | SongDetailScreen shows hint |
| **Slack Import Wizard** | One-time admin task, requires uploading large ZIP files | SettingsScreen shows hint |
| **Split View** (v1.06.83) | Needs ≥1024px width; right-click + drag-resize are mouse-first | Hidden below `lg:` breakpoint |
| **Public Show Pages** (v1.06.85) | Public URL at `/show/<gigId>` — fans access via browser | Toggle is web-only; mobile users can share the link manually |
| **Booking Inbox** (v1.06.86) | Public form at `/book/<slug>` + admin inbox table | Admins manage from web; the form itself is browser-accessible from anywhere |

#### Mobile Only
These features leverage native device capabilities:

| Feature | Rationale |
|---------|-----------|
| **Live Mode** (optimized) | Primary use case is on-stage with phone in hand |
| **Add gig to device calendar** | Native calendar integration via Expo Calendar |
| **Camera for gig photos** | Direct capture vs upload |
| **Haptic feedback** | Touch-specific feedback |
| **Swipe gestures** | Swipe right to reply, left to quick-react |
| **Quick actions** | 3D Touch / long-press app icon shortcuts |
| **Gig gallery** | Browse and manage gig photos |
| **Message reporting** | Report objectionable content |
| **Print & Share setlists** | expo-print integration |
| **Offline detection banner** | More relevant for mobile connectivity |

#### Both Platforms (Core Features)
All communication and reference features work on both:

- Messaging, channels, threads, reactions
- Song list, bulk import, metadata enrichment
- Setlists, setlist performers, live mode
- Gigs, calendar, cross-workspace view
- Members, contacts, polls, announcements
- Settings, profile, themes, data export
- Push notifications, Practice Dashboard

#### Feature Parity Summary (May 2026)

| Area | Parity | Notes |
|------|--------|-------|
| Messaging | 100% | Pinned, saved, link previews, reactions, swipe gestures (mobile), thread reply edit/delete on both (web v1.06.63), group mentions both (v1.06.73) |
| Songs | 90% | Web has Song Suggestions; both have bulk import |
| Setlists | 85% | Web has advanced drag-drop; mobile has print/share |
| Gigs/Calendar | 95% | Web has month view + public Show Pages + Booking Inbox (web only by design); mobile has iCal subscribe; Gig Archive both |
| Members | 95% | Excellent parity |
| Settings | 85% | Mobile has more granular security options |
| Split View | web-only | Two views side-by-side with resizable divider, on ≥1024px screens |

#### Implementation Notes
- Desktop-only features show hints on mobile directing users to the web app
- Core features added to one platform should be added to the other in the same PR when possible

### Empty State Guidelines

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

- **Web:** Include a relevant emoji icon (text-5xl)
- **Mobile:** Use `<Ionicons>` instead of emoji. The `ErrorState` component supports `iconName` prop (renders Ionicons) alongside legacy `emoji` prop.
- Use a clear title ("No songs yet" not just "Empty")
- Provide a helpful description explaining the feature's purpose
- Include an action button when the user can create content
