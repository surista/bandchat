# Changelog

All notable changes to BandChat are documented here.

## [1.07.14] - 2026-05-28

### Fixed

- **Web: multi-set setlist print/PDF layout.** With two (or more) sets, each set column ran flush to the page edge, leaving an uneven, edge-hugging look. Now each set's content sits in a max-380px block that's centered within its half of the page (`align-items: center` on `.set-column`), while the song text inside stays left-aligned. The SET header underline now aligns with the song block rather than spanning the full half. Single-set layout is unchanged (still the centered 500px column). Affects both Print and Word export since they share `buildSetlistHtml()` in `client/src/utils/setlistExport.js`. (Mobile setlist print uses a separate expo-print builder and is unaffected.)

## [1.07.13] - 2026-05-28

### Changed

- **Android: removed manifest-level portrait lock; tablets and foldables now rotate freely while phones stay locked to portrait at runtime.** Addresses a Google Play Console "recommended" advisory for the v1.07.12 submission. Android 16 (shipping ~Aug 2026) will ignore `screenOrientation="PORTRAIT"` on large screens regardless of what we set; the proactive fix avoids unexpected tablet/foldable rotation behavior when that ships. Specifically:
  - `mobile/app.config.js`: `orientation: 'portrait'` → `'default'`. Drops `screenOrientation="PORTRAIT"` from the generated AndroidManifest and removes the iPhone-side `UISupportedInterfaceOrientations` lock. iPad already had explicit all-four-orientations via `UISupportedInterfaceOrientations~ipad`, so no change there.
  - `mobile/App.js`: at module scope (before any screen mounts), call `ScreenOrientation.lockAsync(PORTRAIT_UP)` on phones. Detection: `Math.min(width, height) >= 600 || Platform.isPad` — matches Android's official `sw600dp` "large screen" definition, orientation-invariant so phones launched in landscape (Android only — possible if the user rotates before opening the app) aren't mis-classified.
  - Added `expo-screen-orientation@~9.0.9` to dependencies. iOS-side behavior unchanged on iPhones (runtime lock still applies); iPad layout work in landscape is already governed by `useLayout().isSplitView`. The pieces flagged by the audit as not-yet-audited-in-landscape (notably `DraggableList` in the setlist editor and the message composer at narrow widths) remain unaudited — file as a follow-up if tablet feedback comes in.

## [1.07.12] - 2026-05-28

### Fixed

- **"What's new" dialog now appears for users upgrading from an earlier version.** v1.07.11's "first install" guard was too aggressive: any device without the new `bandchat-last-seen-version` storage key was treated as a brand-new install and silently stamped, which is the *exact* state of every existing user the first time they ran v1.07.11. Effectively, **no one** would have seen the v1.07.11 dialog they were supposed to see on upgrade. Added an "existing user" heuristic: if no last-seen stamp exists but the device has a `bandchat-theme` key (written by ThemeContext on every prior session since long before this feature shipped), treat it as case (b) — show the dialog with all known release notes, then stamp. Genuinely fresh installs still stay quiet. Caught before any mobile EAS build went out; web v1.07.11 had been live for ~24h but the only people stamped during that window were the dev test sessions, so no real users were affected.

## [1.07.11] - 2026-05-27

### Added

- **"What's new" dialog on first launch after an update** (requested by Simon). When the bundled app version is newer than the last version this device has seen, a sheet auto-opens summarizing the user-facing fixes and features added in the interim. Stamps the new version on dismiss so it doesn't re-open until the next update. First installs are silently stamped (no dialog stacked on top of onboarding). Also reachable any time from **Settings → About BandChat** ("What's new" link on web, full row with subtitle on mobile).
  - Shared data file `client/src/data/releaseNotes.js` and `mobile/src/data/releaseNotes.js` (kept in sync by hand on each release — these contain the user-facing summary, not the full CHANGELOG prose). Each entry has `{ version, date, items: [{ kind, text }] }` where `kind` is `added | fixed | changed | security`. Includes a `cmpVersion()` helper that handles the padded 2-digit minor/patch format the bump script produces.
  - Modal components: `client/src/components/common/WhatsNewModal.jsx` (uses the existing `Modal` base — focus trap, ESC, backdrop click) and `mobile/src/components/WhatsNewModal.js` (native sheet with drag handle, `accessibilityViewIsModal`, safe-area padding). Both share a two-mode API: `auto` (self-triggered, version-bounded) and `manual` (controlled `isOpen`/`visible`, shows ALL notes — for the settings entry).
  - Last-seen version stored under `bandchat-last-seen-version` via the existing storage wrappers (`services/storage`), so no Safari-private-mode / AsyncStorage-failure crash risk.

## [1.07.10] - 2026-05-27

Version-only bump. No code changes since v1.07.09 — used to trigger a fresh Vercel + Railway deploy with an updated version label across all three packages and the mobile build number.

## [1.07.09] - 2026-05-27

### Fixed

- **Mobile: setting sound check / doors / stage time on a gig silently dropped the value on save.** Reported by Simon (Blues Implosion). Classic stale-closure: `handleSave` in `mobile/src/screens/band/GigDetailScreen.js:514` was a `useCallback` whose dependency array did not include `soundCheckTime`, `eventStartTime`, `performanceStartTime` (or `multiDay`, `endDate`, `isAdmin`, `isLocked`). The callback captured the *initial* values of those state vars at first render and kept using them. If the user opened the edit form and changed ONLY a time field — without also touching title / venue / notes / one of the other deps — the save closure still held the empty initial value, sent `null` to the server, and the picker visually reverted on the post-save refresh. Editing a time *and* the title looked fine, which is why this was intermittent. Bug has actually been present since v1.04.63 (when the time fields shipped) — `react-hooks/exhaustive-deps` is on but set to `warn`, so it never blocked CI. Fixed by adding all seven missing deps to the array. Web `GigForm.handleSubmit` is unaffected because it's a plain arrow function in render scope, fresh on every render.

## [1.07.08] - 2026-05-26

### Changed

- **Mobile: attach MP3 / audio files in channels and DMs.** The mobile attach sheet now has an "Audio File (MP3, etc.)" option alongside Take Photo / Photo Library / File. The server already accepted MP3/WAV/OGG/AAC/M4A uploads (50MB cap) and the web client has always been able to send them, but the mobile `pickDocument` was restricted to `application/pdf` / `application/zip` only — mobile users could only produce audio via the long-press-mic voice recorder. New `pickAudio` callback in `mobile/src/components/MessageInput.js` uses `DocumentPicker` with `type: 'audio/*'`, sets `isAudio: true` on the attachment so `ChannelScreen.js` routes it through `type: 'AUDIO'` (same path as voice recordings), and the same audio-player UI in `MessageBubble` renders it. 50MB cap matches the server's `ALLOWED_AUDIO` limit.

## [1.07.07] - 2026-05-26

Full-codebase audit follow-up — 10 critical/high findings fixed plus 3 storage-wrapper hardening passes and the new public-booking opt-in UI.

### Security

- **Private channel invite IDOR (`server/src/routes/channels.js`).** `POST /:channelId/members` was gated on `isChannelMember`, which meant any member of a private channel could add any workspace member to that channel — completely defeating `isPrivate`. Private channels now require workspace-admin role to add members; public channels are unchanged (anyone in the workspace can self-join those anyway).
- **Pin / unpin / seen-by leaked private-channel content (`server/src/routes/messages.js`).** All three endpoints checked `workspaceMember` but not `channelMember`, and pin's response includes the full message body + attachments. Any workspace member who knew (or could guess) a `messageId` could pin a private-channel message and read its contents. Each endpoint now adds the channel-member check when `channel.isPrivate`, matching the existing pattern at `/channel/:channelId/pins`.
- **Cross-workspace `bandMember` leak in gigs (`server/src/routes/gigs.js`).** `bandMemberIds` from the request body was inserted into `gigAttendee.create*` with no workspace verification. A workspace member could pass IDs of bandMember rows from other workspaces — the FK insert succeeded, and the attendee list then leaked those foreign rows' names and photos. Both POST and PUT now verify `bandMember.workspaceId === workspaceId` before insert (same shape as the existing setlist-IDs check).
- **Apple Sign-In hardening (`server/src/routes/auth.js`).** `email.toLowerCase()` and `email.split('@')` on a payload without `email` 500'd; replayed tokens were valid until JWT `exp`. Added an explicit `email` null guard with `APPLE_EMAIL_MISSING` error code, and a 5-minute `iat` freshness check that shrinks the replay window if a token leaks. Apple omits `email` on replayed tokens (it's only delivered on the very first authorization), so the null branch is reachable in production.
- **Booking endpoint slug enumeration (`server/src/routes/bookingRequests.js` + `schema.prisma`).** `GET /public/:slug` returned the band's display name for *any* valid workspace slug — the slug alone was the opt-in. Combined with `publicFormLimiter`'s 20/hr cap (which applied only to POST), an attacker could enumerate workspace branding by slug at the rate of a normal browser. Added a new `Workspace.bookingEnabled` boolean (default `false`), gated both public endpoints on it, added a new `publicLookupLimiter` (60/hr/IP) on the GET, and exposed admin GET/PUT settings endpoints so admins can flip the switch. Workspaces with a slug for the Public Show Page feature no longer auto-become bookable.

### Fixed

- **TDZ ReferenceError on render in `mobile/src/screens/workspace/ChannelListScreen.js`.** A persist `useEffect` at line ~161 listed `collapsedStarred` in its dep array, but the matching `useState` declaration was 17 lines further down — the dep array evaluates synchronously at render time and threw "Cannot access 'collapsedStarred' before initialization" before the screen could paint. Moved the `useState` up to where the other `collapsed*` state lives. Effect-callback references at line ~145 were safe (callbacks run after render) — only the dep-array reference was load-bearing.
- **Reconnect wiped paginated history in mobile `ChannelScreen.js:handleReconnect`.** After any socket reconnect, the handler called `setMessages(data.messages)` with only the latest 50 messages from the server, silently discarding any older messages the user had paged in. A user mid-scroll-back through a long thread would be teleported back to "latest" by any blip in network connectivity, with no indicator. Now merges by id (preserving older messages already loaded) and keeps the existing cursor/`hasMore` rather than resetting them.
- **Password change kicked the user out of their own session.** `server/src/routes/auth.js:/password` read `req.refreshTokenHash` (never set by any middleware) and compared against `tokenHash` (a column that doesn't exist — the schema has `token` and stores SHA-256 hashes there). Both branches collapsed to `deleteMany({ userId: req.user.id })`, logging the requester out alongside every other device. Fixed by reading the refresh token from the cookie (web) or request body (mobile, via the updated `api.changePassword`), hashing it with the existing `hashRefreshToken` helper, and using `{ token: { not: currentHash } }`. Falls back to all-sessions-logout if no refresh token can be identified.
- **Web `ThemeContext` could crash Safari Private Mode at boot.** Nine raw `localStorage` reads/writes in `client/src/context/ThemeContext.jsx` would throw `QuotaExceededError` on Safari Private Mode and blank the screen before the error boundary mounted. Migrated all of them to the `services/storage` wrapper, which swallows errors and returns safe defaults.

### Changed

- **Web: insert emojis into messages (not just reactions).** Added an emoji-picker button in `client/src/components/messages/MessageInput.jsx` (next to the `@` button), backed by the existing `ReactionPicker` component with a new `actionLabel` prop (so screen-reader labels read "Insert 😀" instead of "React with 😀"). Search, category navigation, frequent emojis, and the custom `:bandchat:` flame all work. Mobile already had this — feature now at parity.
- **Storage-wrapper migration, round 2 (web).** `ReactionPicker.jsx` (`emojiFrequency`), `MessageList.jsx` (blocked link-preview domains), and `GigCalendar.jsx` (`calendar-month-<workspaceId>`) all moved off raw `localStorage` to the `services/storage` wrapper. Same Safari-private-mode risk as the ThemeContext fix; each is one error away from blanking the screen.
- **Storage-wrapper migration (mobile).** `AuthContext.js`, `ThemeContext.js`, `ChannelScreen.js`, and `useMessageActions.js` migrated from raw `AsyncStorage`/`SecureStore` calls to the `getUiState`/`setUiState`/`getUiString`/`setUiString` wrappers in `services/storage.js`. AsyncStorage failures (or corrupted JSON from old versions) now return safe defaults instead of crashing the screen. Tokens still use SecureStore via the `storage` default export.
- **Public booking inbox: opt-in UI.** Admins now see an explicit "Enable public booking" CTA in the web BookingInbox (`client/src/components/band/BookingInbox.jsx`) instead of being shown a public URL that may or may not be live. Mobile gets a "Public Booking Form" section in `WebsiteSettingsScreen.js` with a toggle and the public link — independent of website deploy state, since opt-in to bookings doesn't require deploying a band website.

### Schema

- **`Workspace.bookingEnabled` (Boolean, default `false`).** Added to `server/prisma/schema.prisma`. Applied automatically by the production `npm run start` (which runs `prisma db push`). For staging, run `cd server && npm run db:push`.

## [1.07.06] - 2026-05-26

### Fixed
- **Mobile: "N replies" badge missing under older parent messages.** Bug 1 from Simon's report. Disambiguated by the data: web showed the badge correctly for the same parent message, today's mobile messages showed the badge correctly, but older parent messages (yesterday or earlier) did not. Root cause: **stale SQLite cache**. The pre-load step in `ChannelScreen.js:init()` reads from local SQLite for instant display. When a thread reply arrived via `message:reply` socket event, `handleReply` was incrementing the parent's `_count.replies` in React state — but not persisting that to SQLite. On the next session, the SQLite-cached version of the parent (with stale `replies: 0`) was loaded; if the parent had since rolled off the API's latest-50 window, the user had to scroll up to find it, and the only version available was either the stale cache or fresh API data via load-more. Two-part fix:
  - `handleReply` now also calls `updateLocalMessage(parentId, { _count: updatedCount })` so SQLite reflects new replies.
  - Load-more handler now calls `upsertMessages(data.messages)` so paginated batches refresh SQLite with the freshest `_count`, reactions, etc. — instead of leaving the cache at whatever it was when the messages were originally fetched.

Note: today's specific instance for Simon (Surista's 9:34 PM parent showing no badge) is a sunk-cost stale entry that this fix can't retroactively repair, but going forward all new replies update the cache. Stale entries get fixed the next time the user scrolls past them (load-more upserts fresh data).

## [1.07.05] - 2026-05-25

### Fixed
- **Tapping an iOS notification for a thread reply dropped users in the channel without opening the thread.** Reported by Simon. Root cause: the server's thread-reply push URL was `?channel=Y&msg=<replyId>` with no thread context, so the client couldn't tell the difference between a top-level message notification and a thread reply. The reply id lived nested in a thread, not in the channel's top-level messages, so any attempt to highlight it failed silently.
  - **Server (`messages.js`):** thread-reply push URL now includes `&thread=<parentId>`. Top-level message notifications keep the existing `?channel=Y&msg=<id>` shape.
  - **Mobile (`App.js`):** parses `thread` from the notification URL and passes it through to `ChannelScreen` as `openThreadId`. **`ChannelScreen.js`:** new effect — once messages load, finds the parent message and pushes `ThreadScreen` onto the navigation stack (guarded by a ref so re-renders don't re-navigate). Back from Thread → Channel → workspace list, as expected.
  - **Web (`ChannelView.jsx`):** reads `?thread=` symmetric to `?msg=`, calls `onOpenThread(parent)` once messages load (same ref-guard pattern), then strips the param from the URL so a refresh doesn't re-trigger.
- Note: still pending Simon-side diagnostic on the "1 reply" badge missing under parent messages (Bug 1 from the same report). Asked him to pull-to-refresh next time it happens; will diagnose further once we know if it's a missed real-time event vs. a stale-data issue.

## [1.07.04] - 2026-05-24

### Fixed
- **Website settings: "Upgrade Template" falsely offered when the band repo's version was *ahead* of the template repo.** `WebsiteTab.jsx` was comparing template versions with `!==` and treating any difference as an upgrade — so a band repo at `v1.3.1` would see a yellow "→ upgrade available: v1.3.0" prompt against a template repo at `v1.3.0`, and clicking the button would silently downgrade the site. The inline code comment literally said "*When `latest > band`, surface the Upgrade Template button*" but the implementation didn't match the intent. Fix: added a dotted-numeric `compareSemver()` helper, and the three render branches now use proper greater/equal/less comparisons. New "ahead of template (latest published: vX)" informational state when the band is locally ahead.

## [1.07.03] - 2026-05-24

### Fixed
- **Google Sign-In: actually fixed this time** (the v1.07.02 dotenv-path fix was necessary but not sufficient). Root cause turned out to be more interesting: Expo's bundler auto-loads `EXPO_PUBLIC_*` vars from `.env` via its own mechanism (which is why `EXPO_PUBLIC_API_URL` kept working in production builds despite `.env` being gitignored), but it ignores any non-prefixed vars. `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_CLIENT_ID` therefore only reached `app.config.js` via the explicit `require('dotenv').config()` — and even after anchoring dotenv to `__dirname` in v1.07.02, the file simply wasn't present in EAS's evaluation context (gitignore was excluding it from the tarball). Fix: move the four env vars (Google IDs + the two `EXPO_PUBLIC_*` URLs, for belt-and-suspenders) into `mobile/eas.json` under `build.production.env`. EAS injects these directly into `process.env` at build time, completely bypassing `.env`-file-presence concerns. The iOS OAuth client ID is not a secret — it ships in the IPA and is visible to anyone who unzips it — so committing it to `eas.json` has the same risk profile as shipping the app.

## [1.07.02] - 2026-05-24

### Fixed
- **`GOOGLE_IOS_CLIENT_ID` silently undefined in production iOS builds.** Real root cause of the cryptic "GoogleService-Info.plist was not found" error that v1.07.01 added user-facing messaging for. `mobile/app.config.js:1` called `require('dotenv').config()` with no `path` option, which resolves `.env` relative to `process.cwd()`. When `eas build --platform ios --profile production --local` evaluates `app.config.js`, the cwd isn't guaranteed to be `mobile/` — so dotenv silently missed `.env`, `process.env.GOOGLE_IOS_CLIENT_ID` was undefined at config-eval time, `extra.googleIosClientId` was baked into the native bundle as undefined, and `GoogleSignin.configure()` had nothing to use. The `EXPO_PUBLIC_*` vars in the same `.env` were unaffected because Metro / Expo's bundler picks those up via its own mechanism — that's the breadcrumb that made this confusing to diagnose (API URL worked, Google didn't, same `.env` file). Fix: anchor dotenv to `__dirname`:
  ```js
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
  ```
  Verified locally: dotenv loads 4 vars (`GOOGLE_IOS_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL`) regardless of cwd.

## [1.07.01] - 2026-05-24

### Fixed
- **Cryptic Google Sign-In error shown on the iOS login screen.** When a build was compiled without `GOOGLE_IOS_CLIENT_ID` set, `GoogleSignin.configure()` threw `"RNGoogleSignin: failed to determine clientID — GoogleService-Info.plist was not found and iosClientId was not provided"` and the raw SDK message landed in the login screen's error banner. Two fixes:
  1. `LoginScreen.js`, `SignupScreen.js`, `SecurityScreen.js` now skip the `configure()` call when the platform's client ID is missing (no more boot-time warning).
  2. Tapping the Google button (or the catch block intercepting the raw error) now shows a clear *"Google Sign-In isn't configured in this build. Please use email or Apple."* instead of the SDK's internal message. The Google button stays visible — fix on the build side is to set `GOOGLE_IOS_CLIENT_ID` (and `GOOGLE_CLIENT_ID` for Android) in `mobile/.env` (local) or the EAS env (production) and rebuild.

### Changed
- **Apple Sign-In moved above Google on iOS** in `LoginScreen`, `SignupScreen`, and `SecurityScreen` (Link Account section). App Store Guideline 4.8 requires Sign in with Apple to be offered with equivalent prominence to any other third-party login when both are present; convention is to place Apple first.

## [1.07.00] - 2026-05-23

### Fixed
- **Mobile: no escape from the onboarding wizard for first-time accounts.** If a user accidentally signed in with the wrong provider (e.g. tapped Apple instead of Google) a fresh account was created, and `WorkspaceListScreen.js:46` auto-routed them into `OnboardingWizardScreen` via `navigation.replace()`. The wizard's X-button called `navigation.goBack()`, which silently did nothing because there was no back stack — so the user was trapped, unable to return to the login screen without killing the app. Fix: when there's no workspace yet *and* `navigation.canGoBack()` is false, the X-button now prompts "Cancel setup? You'll be signed out and returned to the login screen" with a Sign out option that calls `useAuth().logout()`. The voluntary-entry path (workspace list → Create Workspace, where there *is* a back stack) is unchanged. Web isn't affected — `WorkspaceList.jsx:97` already shows a Sign Out button in the header.

## [1.06.99] - 2026-05-19

### Fixed
Two user-reported bugs:

#### Notification deep-linking (Eric)
Clicking a push notification was dumping users on the workspace shell with nothing selected — sometimes back at the band-spaces list — instead of taking them to the specific message/calendar/announcement the notification was about. Three compounding issues:

1. **Message notifications didn't include the message id.** `server/src/routes/messages.js` built the URL as `/workspace/X?channel=Y` — taking the user to the channel but not scrolling to the actual message. The client (`ChannelView.jsx:58`) already reads `?msg=<id>` for deep-linking; the server just wasn't sending it. Fixed by appending `&msg=${message.id}` to the push URL.
2. **Gig / poll / announcement / gig-comment notifications had no view hint** — all four pointed at `/workspace/X` with no further direction. Server now sends `?view=calendar` / `?view=polls` / `?view=announcements` so the right pane is selected on arrival. `WorkspaceView.jsx` now reads `?view=<name>` on mount + on workspace change (validated against the `BAND_VIEW_COMPONENTS` registry) and strips the param after 1.5s so reloads don't re-force it.
3. **Post-login redirect dropped the query string.** `App.jsx:57` stored `from: location.pathname` and the search/hash were lost across `/login` — so a notification tapped while signed out would lose its deep-link hints. Now stores `pathname + search + hash`.

#### "Calendar not compatible" (Daniel)
Mobile **Add to Calendar** (`mobile/src/screens/band/GigDetailScreen.js`) called `Calendar.getDefaultCalendarAsync()` on iOS and used the result blindly. If the user's default calendar was a subscribed / read-only calendar (Holidays, Birthdays, a Google sync), `createEventAsync` threw and the catch block showed a generic "Failed to add event" — which read as "incompatible" to the user. Two fixes:

- iOS now filters for `allowsModifications` (matching what the Android branch already did) and falls back to the first writable calendar if the default isn't writable. If nothing writable exists, the alert explains *why* and tells the user to add a local calendar.
- The catch-block alert now surfaces the actual error message instead of a generic string, so the next person reporting it has something specific to act on.

### Notes
- Web + server changes deploy via the usual Railway/Vercel push.
- Mobile calendar fix needs a new EAS build to reach users (no over-the-air channel configured). User is doing those locally via `npm run deploy:ios` / `npm run deploy:android`.

## [1.06.98] - 2026-05-19

### Changed
- **Audio file upload limit raised 30MB → 50MB**, matching the video cap. Multer's underlying `fileSize` cap was already 50MB (driven by `MAX_VIDEO_SIZE`), so the audio-specific check was the only thing holding the limit back. Updated:
  - `server/src/routes/uploads.js` — `MAX_AUDIO_SIZE` constant + the LIMIT_FILE_SIZE error message.
  - `client/src/utils/fileValidation.js` — `MAX_AUDIO_SIZE` constant + matching test.
  - `CLAUDE.md` — feature description.
- Mobile has no client-side audio size cap; it trusts the server, so it picks up the new limit automatically with no app build needed.

## [1.06.97] - 2026-05-18

### Added — Personal song notes + Word setlist export (web only)
Requested by user: a way to annotate songs in a setlist with private reminders ("drop D tuning", "don't forget to retune") that show up on their printed/exported sheet without affecting the band-wide setlist content. Plus Word export as a peer to the existing PDF export — opens directly in Microsoft Word.

#### Personal notes
- **New `SetlistSongNote` model** (`server/prisma/schema.prisma`) keyed on `(userId, setlistSongId)`. Cascade-deletes when the setlist song or user is removed. Indexed on both columns for fast lookups.
- **New routes** (`server/src/routes/setlists.js`):
  - `GET /api/setlists/:setlistId/my-notes` — returns `{ [setlistSongId]: { content, updatedAt } }` for the current user only.
  - `PUT /api/setlists/songs/:setlistSongId/my-note` — upserts the current user's note. Empty content deletes the row, so saving an empty input clears the note (no separate DELETE needed).
- **Inline editor in `SetlistBuilder`** — small italic input under each song in the setlist view. Visible only to the current user. Debounced 800ms save with optimistic local state. Placeholder reads "📝 your private note (e.g. drop D tuning) — saved only for you" so the privacy is clear without a UI label. Implemented in both the single-column and multi-column layouts.
- **Notes flow through to exports** — PDF (Print) and Word both fetch the user's notes and render them as small italic lines under the song name.

#### Word export
- **New `📝 Word` button** alongside the existing 🖨️ Print in both `SetlistBuilder` and `SetlistList` views (also added to the per-setlist context menu).
- **Implementation:** `client/src/utils/setlistExport.js` (new). Generates HTML with a UTF-8 BOM and serves it as `application/msword`. Word opens it transparently as a native document. No external library — keeps the bundle lean (the standard `docx` library would have added ~100KB+ for what amounts to a static one-page document).
- **One HTML builder for both Print and Word** — the only difference is the output mechanism (popup + `window.print()` vs. blob download). Layout, fonts, columns, set timings, notes — all identical.

#### Refactor
The same setlist-export HTML was previously duplicated across `SetlistBuilder.handlePrint` (~200 lines) and `SetlistList.handlePrintSetlist` (~280 lines), with small drift between them. Both now delegate to `setlistExport.js`. `SetlistList.jsx` shrank by ~240 lines; `SetlistBuilder.jsx` print logic shrank by ~190 lines.

#### Platform parity
Web-only this version per user request. The server-side model + endpoints exist, so a mobile follow-up only needs UI work — notes already persist and would surface on next mobile build's exports. Tracked as platform parity gap in CLAUDE.md.

#### Schema migration
Railway runs `prisma db push` on every deploy (per `server/package.json` `start` script), so the new `SetlistSongNote` table lands automatically on next deploy. No manual migration step needed.

## [1.06.96] - 2026-05-17

### Added — Live booking inbox + storage/error infrastructure
Pulled the loose threads identified in a full code review. No user-visible features; foundational improvements that prevent classes of bugs.

#### Real-time booking inbox notifications
- **`server/src/routes/bookingRequests.js`** — public form submissions now emit `bookingRequest:new` to each workspace admin's `user:${id}` socket room. Admins see the inbox count tick up immediately instead of needing a refresh. Fire-and-forget: a socket failure doesn't fail the public form submission. Closes the only TODO comment in the codebase.

#### Backup observability
- **`server/src/routes/admin.js`** — `POST /api/admin/backups` and the entire restore lifecycle (initiated / completed / failed) now record `AuditLog` entries via `logAudit()`. The "initiated" event fires *before* the restore runs so there's a record even if the restore corrupts the audit table or never returns. Restore endpoint itself was already solid (RESTORE DATABASE confirmation phrase, `restoreInProgress` lock, automatic safety backup before overwrite).

#### Error-handling infrastructure
- **`server/src/lib/apiError.js` (new)** — `ApiError` class carrying `status`, optional `code`, optional `details`; plus `asyncHandler(fn)` wrapper that funnels rejected promises into Express's error middleware. New routes can `throw new ApiError(404, 'Not found', { code: 'NOT_FOUND' })` instead of writing repetitive try / console.error / res.status() blocks.
- **`server/src/app.js`** — global error handler now recognizes `ApiError` (uses its status, includes `code`/`details` in the body), and 4xx errors aren't logged at error level. Every error response now includes the `requestId` so support can correlate user reports to server logs. Existing routes' `res.status(500)` patterns keep working unchanged — this is strictly additive, no 35-route migration churn.

#### Validation
- **`server/src/lib/validators.js`** — added `TEXT_LIMITS` (NAME, TITLE, LABEL, URL, SHORT_TEXT, LONG_TEXT, MESSAGE_BODY, LYRICS) plus `checkText()` and `validateTextFields()` helpers so new routes use uniform caps instead of per-route magic numbers.
- **`server/src/routes/stagePlots.js`** — the one real validation gap found across all 35 route modules: stage plot titles had no length cap. Now uses `checkText(title, 'Title', TEXT_LIMITS.TITLE, { required: true, minTrim: 1 })`. All other text-accepting routes audited and confirmed to already enforce caps.

#### Safe storage wrappers (web)
- **`client/src/services/storage.js` (new)** — wraps localStorage. Swallows `QuotaExceededError` (Safari private mode), corrupted JSON, and storage-disabled environments. Returns sensible defaults instead of throwing. Surface: `getString` / `setString` / `getNumber` / `setNumber` / `getBool` / `setBool` / `getJSON` / `setJSON` / `remove` / `isAvailable`.
- **Migrated worst-offending call sites** — `WorkspaceView.jsx` (8 sites: bandView, selectedChannel, sidebarWidth, splitRight, splitWidth) and `Sidebar.jsx` (collapsedGroups + collapsedSections). Safari private mode users who previously got React error-boundary screen blanks when persisting UI preferences now degrade silently to "your preference didn't save."

#### Safe storage wrappers (mobile)
- **`mobile/src/services/storage.js`** — added `getUiState` / `setUiState` / `getUiString` / `setUiString` / `removeUiState` for non-sensitive per-screen state (JSON-encoded, AsyncStorage-backed, never throws). Sits alongside the existing SecureStore-backed token helpers.
- **`mobile/src/screens/workspace/ChannelListScreen.js`** — all 9 direct `AsyncStorage` call sites migrated (6 collapsed-state keys + lastWorkspaceId/Name); direct `AsyncStorage` import removed. Eliminates the inconsistent `.catch(() => {})` chains for the same operation.

### Notes on what *wasn't* done
- Backup restore endpoint already existed; only audit logging was missing.
- Validation coverage was already comprehensive across all 35 routes; only stagePlots needed a fix.
- No existing routes were migrated to ApiError/asyncHandler — strictly additive infrastructure.
- Storage migration limited to the worst-offending files; remaining call sites convert opportunistically when those files are touched for other reasons.

## [1.06.95] - 2026-05-15

### Added — Per-template font pairings + band-level override
Until now, every Design Template (Rock, Grunge, Pop, Jazz, Covers, Country, Metal, Electronic) used the same Oswald + Inter typography from the template repo — only colors differed. User feedback after picking the Grunge template: "not sure I'm a fan of this font - this is the 'Grunge' template." Right — Oswald is the wrong vibe for a grunge site.

- **Template repo (`bandchat-website-template` v1.3.2)** — 8 opinionated font pairings defined in `vite.config.js` (`FONT_PAIRS`): `classic` (Oswald + Inter), `grunge` (Anton + Special Elite), `playful` (Poppins), `editorial` (Playfair Display + Lora), `clean` (Bebas Neue + Inter), `warm` (Cabin + Merriweather), `tight` (Black Ops One + Roboto Condensed), `futuristic` (Orbitron + Space Grotesk). Each `theme.template` maps to a sensible default via `TEMPLATE_DEFAULT_FONT_PAIR`. Google Fonts loading moved out of `index.html` into the dynamically-generated theme CSS — new deploys only load the fonts they actually use.
- **BandChat side** (`client/src/components/channels/WebsiteTab.jsx`):
  - New **Font Pairing** dropdown under Design Template. Default option shows the template's auto-picked pair ("Default for template (Grunge Typewriter)") so users see *what* they'd get if they leave it untouched. Override with one of the 8 named pairs.
  - Persists to `site.config.js` as `theme.fontPair: 'grunge' | ...` (or omitted to use the template default).

### Migration
Existing band sites stay on Oswald + Inter until the band clicks **Upgrade Template** (v1.06.94) to copy the new `vite.config.js` + `index.html` into their repo. After upgrade, the Grunge template will look different — that's the whole point.

## [1.06.94] - 2026-05-14

### Added — Template upgrade for existing band sites
Each band's deployed-site repo is a one-time clone of the template (via GitHub's "generate from template" API) and has no Git relationship to upstream. So template improvements like the v1.3.1 customizations renderers don't propagate to existing bands via Sync — only freshly created bands get them. Reported by user when another workspace's site was stuck at template v1.3.0 despite Frozen Assets being on v1.3.1.

- **Server `getTemplateVersion()` + `getBandRepoTemplateVersion(repoName)`** (`websiteDeployment.js`): read `package.json` from the template repo and the band's repo, respectively. Used to compare versions and surface an "Upgrade available" hint.
- **Server `upgradeTemplate(bandRepoName)`** (`websiteDeployment.js`): walks the template's HEAD tree, fetches each blob's content, and PUTs it into the band's repo via the GitHub Contents API. Skips band-specific paths (`site.config.js`, `public/data/`, `public/images/logos+site+members+gigs/`, `package-lock.json`, `CHANGELOG.md`, `.env*`, `backups/`) so the band's identity, uploaded images, and synced JSON data are preserved. Falls back to `main` ref if `master` doesn't exist. Returns `{ filesUpdated, filesCreated, filesSkipped }` summary.
- **Server routes** (`server/src/routes/website.js`):
  - `GET /:workspaceId/template-version` — returns `{ band, latest }` for the UI
  - `POST /:workspaceId/upgrade-template` — admin only, rate-limited via `deployLimiter`, calls `upgradeTemplate` then triggers a deploy
- **UI** (`client/src/components/channels/WebsiteTab.jsx`): the status card on a deployed site now shows the current template version + an "upgrade available: vX.Y.Z" hint when the band is behind. Click **Upgrade Template** to run the copy + rebuild flow. Confirmation prompt explains what's preserved.

### How to upgrade your existing band sites
For each workspace stuck on an older template:
1. Settings → Website (must be deployed and healthy — i.e., not in the errored-with-infra recovery state)
2. Look for "Template: v1.3.0 → upgrade available: v1.3.1" under the URL
3. Click **Upgrade Template**, confirm, wait for the rebuild (~60s)

## [1.06.93] - 2026-05-14

### Fixed
- **`websiteStatus` stuck at `'error'` after successful Sync** — Reported on Frozen Assets: hitting Sync didn't clear the red "last deploy failed" banner even though Vercel was happily rebuilding the site each time. Root cause: `POST /api/website/:workspaceId/sync` triggered the rebuild but never updated `websiteStatus` — only the full Deploy flow did that. So a workspace that errored once was forever stuck in the recovery banner even when subsequent syncs worked. **Fix:** `/sync` now optimistically marks `websiteStatus: 'active'` and refreshes `websiteDeployedAt` after a successful trigger. Vercel does the actual build async — if it fails, the user notices on the site itself and can retry.

## [1.06.92] - 2026-05-14

### Fixed
Reported by user editing Frozen Assets in the errored-but-provisioned state: changing fields (e.g. Meta Description, toggling Active in Advanced Customizations) didn't persist on refresh. Two compounding bugs:

1. **Save Config button was hidden** in any state other than "deployed & healthy" — including the errored-with-infra recovery state. Users had no way to persist edits without a full rebuild. Edits sat in component state, then `loadWebsite()` on refresh re-fetched DB state and showed the old values.
2. **Sync didn't push the latest config to GitHub** before triggering the rebuild. Even when config was saved to the DB, the next Sync re-built from whatever `site.config.js` was already in the band's repo.

#### Client fixes (`client/src/components/channels/WebsiteTab.jsx`)
- **Save Config button is now always visible** when `websiteEnabled` is true. Sits in the bottom button row alongside Deploy / Sync / Delete.
- **"Unsaved changes" indicator** shows next to the buttons when `configDirty` is true.
- **`handleSync` now saves config before triggering the rebuild** — Sync becomes "save my current state + rebuild," matching user mental model.

#### Server fix (`server/src/routes/website.js`)
- **`POST /sync` now writes `site.config.js` to the band's GitHub repo** before triggering the Vercel deploy hook. Non-fatal if the GitHub write fails — the rebuild still happens with whatever's in the repo (no regression vs. previous behavior).

## [1.06.91] - 2026-05-14

### Marker
Version bump only — no code changes. Released after v1.06.90 customizations + template v1.3.1 to mark the release point.

## [1.06.90] - 2026-05-14

### Added — Advanced Website Customizations (Phase 1a + 1b)
Bands can now embed YouTube videos and add custom links on their deployed website, with a safety toggle that reverts to plain BandChat sync if anything breaks. Per-gig posters auto-render from the existing GigMedia gallery.

#### Phase 1a — Customization layer with kill switch
- **`websiteConfig.useCustomizations` boolean** — defaults `false` (existing workspaces are unaffected). Controls whether the customization layer is rendered on the deployed site.
- **`websiteConfig.customizations.youtubeUrls: string[]`** — full YouTube URLs. Each renders as an embedded video on the site.
- **`websiteConfig.customizations.customLinks: { label, url }[]`** — generic "links in bio" array for Bandcamp, merch stores, press kits, etc.
- **Server (`/api/website/api/:workspaceId/data`)**: when `useCustomizations === false`, the `customizations` sub-object is stripped from the response. **The data is preserved in the DB** — flipping the toggle back on restores everything without re-entry. The kill switch is fail-safe by design.
- **UI (`client/src/components/channels/WebsiteTab.jsx`)**: new "Advanced Customizations" section with an Active/Paused toggle, YouTube URL editor (add/remove/edit), custom-links editor, and a prominent **"⚠ Revert to plain BandChat sync"** button. Revert flips the kill switch, saves, and triggers a rebuild — non-destructive.
- **Paused-banner UX**: if customizations exist but the toggle is off, a yellow banner reminds the band that their data is saved but won't appear on the deployed site.

#### Phase 1b — Gig posters from existing GigMedia
- **Server data response**: each gig now includes `posterUrl` — derived from the first `image`-type item in `gig.media`. Falls back to `null` if no image. Templates can render `gig.posterUrl` directly instead of re-deriving the lookup themselves.
- **Zero band action needed** — bands who upload photos to gigs in BandChat get gig posters on their website automatically. This isn't gated by `useCustomizations` (it's a pure sync improvement, not an opt-in customization).

#### Template repo follow-up (out of scope here)
The deployed-site template repos need a follow-up release to actually render `customizations.youtubeUrls`, `customizations.customLinks`, and `gig.posterUrl`. Until then, the new fields are stored and exposed via the data endpoint but won't appear on deployed sites. The BandChat-side change is forward-compatible: existing template versions ignore unknown fields.

#### Deferred (Tier 3 + Tier 4)
- Tier 3 (content blocks — drag-drop ordered sections) — defer until there's demand. The kill switch + customization scaffolding here is the foundation for it.
- Tier 4 (custom domains) — a separate change adding `websiteCustomDomain` + Vercel API integration. Will come in its own commit.

## [1.06.89] - 2026-05-14

### Fixed
- **Website tab: workspaces stuck at `status='error'` had no Sync option** — When a website deploy failed late in the pipeline, the workspace was left with `websiteEnabled: true` (infrastructure provisioned, often even `websiteUrl` set) but `websiteStatus: 'error'`. The Website tab gated its "Sync Now" button behind `isDeployed = websiteEnabled && status === 'active'`, so users had no recovery path except a full redeploy. Reported for the Frozen Assets workspace.

  **Server-side, the `/sync` endpoint only requires `websiteEnabled: true`** + an existing deploy hook (`server/src/routes/website.js:255-279`) — so Sync was always a valid recovery for these workspaces, just not surfaced in the UI.

  Fixes:
  - New `isErrorWithInfra` branch in `client/src/components/channels/WebsiteTab.jsx`: when `websiteStatus === 'error'` AND `websiteEnabled` is true, render a recovery panel with **Sync Now** and **Retry Deploy** buttons side-by-side, plus the current URL (if any) so the user can check whether the site is actually live with stale data.
  - The bottom "Deploy Website" button is hidden when the recovery panel is showing, to avoid duplicating the CTA.
  - Initial-deploy failures (where no infrastructure exists yet) keep the original simple error banner — Sync isn't a valid path there.

## [1.06.88] - 2026-05-13

### Fixed
- **Mobile Gig Gallery: YouTube videos showed as generic link icons and were unresponsive to taps** — Two bugs in `mobile/src/screens/band/GigGalleryScreen.js`:
  1. The tap handler only opened the image lightbox for `type === 'image'` items; videos, YouTube links, and external links silently swallowed taps with no action.
  2. The render only branched on `image` vs `video` — `youtube` and `link` types both fell through to a nondescript link icon over a gray tile.

  Fixes:
  - **YouTube tiles now render the actual YouTube thumbnail** (`img.youtube.com/vi/<id>/hqdefault.jpg`) with a play-button overlay, matching the message-bubble pattern from `MessageBubble.js`. Older `type: 'link'` rows that happen to be YouTube URLs are also detected and rendered this way (back-compat for legacy data).
  - **Tapping any non-image tile** now calls `Linking.openURL(item.url)` — opens YouTube in the app, video files in the browser/native player, external links in Safari/Chrome.
  - Accessibility labels now report the correct kind (`'YouTube video'`, `'Video'`, `'Link'`, `'Photo'`) instead of always `Photo` or `Video`.

## [1.06.87] - 2026-05-11

### Documentation
- **README**: feature list updated with Split View (web), Public Show Pages, and Booking Inbox. Model count bumped to 55. Web component-count note + mobile-vs-web parity note for the new web-only features.
- **CLAUDE.md**: Platform-Specific Features table now lists Split View, Show Pages, and Booking Inbox under "Desktop/Web Only" with rationale. Feature Parity Summary refreshed (`Gigs/Calendar` row now mentions Show Pages + Booking Inbox; new `Split View` row marked web-only by design). Schema count bumped to 55.

### Mobile release prep
This is the version that the next mobile build/submit cycle will ship. Mobile-side changes accumulated since the v1.06.81 hotfix that's currently on TestFlight/Play production:

| Version | Mobile change |
|---|---|
| v1.06.76 | Dark-mode contrast bump (`textSecondary` → `#d1d5db`) in `mobile/src/context/ThemeContext.js` |
| v1.06.77 | `maxFontSizeMultiplier` 1.0 → 1.3 on emoji glyphs, channel/workspace unread badges, DM avatar initials; ~7 descriptive `accessibilityLabel`s on `<Image>`, ~20 marked decorative; 12 success-only `Alert.alert` → `useToast` toasts |
| v1.06.78 | ~61 `TouchableOpacity` → `PressableRow`/`Pressable+ripple` across `GigDetailScreen`, `SongListScreen`, `SongDetailScreen`, `SetlistDetailScreen`, `StagePlotEditorScreen` |
| v1.06.79 | `AppearanceScreen` `LayoutAnimation` now honors `AccessibilityInfo.isReduceMotionEnabled()` |
| v1.06.80 | `utils/formatDuration.js` returns `null` (not `''`) for falsy input; `services/storage.js` test fixes |

None of these touch app-lifecycle hooks or notification timing (the v1.06.75 regression class). Risk is bounded to component-swap regressions on band screens — `PressableRow` is a pre-existing component used widely elsewhere, so the conversion sweep is mechanically safe but worth a smoke-test pass on each affected screen post-install.

## [1.06.86] - 2026-05-11

### Added — Booking Inbox (Feature #3 of 3)
Each band gets a public booking-request form at `bandchat.app/book/<slug>`. Promoters and venues fill it out; submissions land in a workspace-level admin inbox.

- **Schema**: new `BookingRequest` model (requesterName/email/phone, venueName, eventDate, feeOffer free-form, message, status: `new`/`responded`/`archived`, respondedAt/respondedById). Back-refs added on `Workspace` and `User`. Indexed by `(workspaceId, status, createdAt)` for fast tab-filtered lists.
- **Server — public**: `GET /api/bookings/public/:slug` returns just `{ bandName, avatarUrl }` so the form can show a header (no workspaceId leaked). `POST /api/bookings/public/:slug` accepts submissions, validates length + email format both client and server side, rate-limited via `publicFormLimiter` (20/h/IP).
- **Server — admin**: `GET /api/bookings/workspace/:workspaceId` (admin-only) lists with status filter, `PUT /api/bookings/:id` updates status, `DELETE /api/bookings/:id` removes.
- **Web — public form**: new lazy route `/book/:slug` → `BookingForm.jsx`. Mobile-first layout, native `<input type="email">`/`type="tel">`/`type="date">` for OS-native input UIs, success and error states. 404-style fallback that doesn't leak workspace existence.
- **Web — admin inbox**: new band view "Booking Inbox" (sidebar → Gigs → Booking Inbox). Lists requests by tab (New / Responded / Archived). Each row: requester contact info (mailto/tel links), event details, message, response metadata if responded. Actions: Mark as responded / Archive / Reopen / Delete. Banner at top shows the public form URL with Copy + Preview.
- **Mobile**: no changes for v1. Admins manage from web; mobile users see no booking-related UI until a future enhancement.

### Notes
- Bands without a `Workspace.slug` set don't have a public form URL — the inbox view shows a banner prompting them to set one. Adding a slug enables the booking form automatically (no separate opt-in toggle yet — kept simple for v1).
- Booking Inbox is currently visible in the sidebar to *all* workspace members, but the server enforces admin-only access on the list/edit/delete endpoints. Non-admins clicking the menu item will see a 403. Sidebar admin-gating is a follow-up.

## [1.06.85] - 2026-05-11

### Added — Public Show Pages (Feature #1 of 3)
Bands can now share a public, fan-facing page for any completed gig.

- **Schema**: new `Gig.isPublic` boolean (default `false`). One field, applied by the production server's `db push` on next deploy. No data migration needed.
- **Server**: `GET /api/public/shows/:gigId` — unauthenticated route. Returns 404 unless the gig exists *and* `isPublic = true`. Response is sanitized: band name, gig title/date/venue, setlist items (titles + artists only — keys, BPMs, notes, attachments all stripped), and gig-gallery media (images/videos/YouTube links). No member IDs, no internal status, no workspace IDs. Rate-limited via the existing global `apiLimiter` (IP fallback for anonymous).
- **Server**: existing `PUT /api/gigs/:gigId` now accepts `isPublic` in the body. Allowed only for the gig creator or a workspace admin (same gate as `isPersonal`).
- **Web**: new public route `/show/:gigId` → `client/src/components/public/ShowPage.jsx`. Lazy-loaded. Renders the show page with a "Copy link" button. 404-style fallback for non-public/non-existent gigs that leaks nothing about whether the gig exists internally.
- **Web**: in the existing `GigForm` visibility section (next to "Personal entry" and "Lock event"), a new "Public show page" toggle. When enabled on a saved gig, the form shows the full URL, a copy button, and a preview link.
- **Mobile**: no changes for v1 — bands can toggle from web, mobile users can still share the link manually if they paste it. Mobile toggle UI is a follow-up so we don't need a mobile-build cycle to ship the feature.

### Notes
- The privacy boundary is deliberately conservative: a public show page exposes only what a fan would see at the gig itself (which song was played and any photos the band uploaded to the gig gallery). Internal song details — keys, BPM, attachments, lyrics, notes — never cross the boundary.
- Show pages are intended for completed gigs, but there's no status filter on the server side yet — bands can technically expose an upcoming gig's setlist this way (useful for tour preview pages). Status filtering can be added later if needed.

## [1.06.84] - 2026-05-10

### Fixed
- **Split-view button overlapping channel header buttons** — The floating "Split right" button introduced in v1.06.83 sat at the top-right corner of the content area, which is exactly where `ChannelView`'s action buttons live (Pin Setlist, Members, Pinned Messages, Search). The Split button was visually covering them.
  - **Channels**: the Split button now lives *inside* `ChannelView`'s existing button row (next to Members), via a new `onSplitRight` prop. No more overlap.
  - **Band views** (Calendar, All Messages, Songs, etc.): keep using the floating top-right button — band views don't have the same crowded action bar so there's nothing to overlap there.

## [1.06.83] - 2026-05-10

### Added
- **Web split view (two channels/views side-by-side)** — Open Calendar + a chat channel side-by-side, or All-Messages + a channel, etc. Two ways to enable:
  - **"Split right" button** (top-right of the content area, desktop only) — pins the *current* view to a new right pane and clears the left so you pick a fresh left from the sidebar
  - **Right-click any channel in the sidebar → "Open in split right"** — adds an item to the existing channel context menu, doesn't disturb the left pane
  - Drag the divider between panes to resize (clamped to 25–75% so neither pane collapses); width persists per workspace in localStorage
  - **Close button (X)** in the right-pane header to collapse back to single-pane
  - State persists per workspace: `splitRight:${workspaceId}` (selection) and `splitWidth:${workspaceId}` (percent)
  - **Below 1024px width (`lg:` breakpoint) the split is hidden but state is preserved** — it reappears when the window grows back. Mobile out of scope intentionally (separate UX problem).
  - **Thread panel takes priority** — opening a thread on the left pane temporarily hides the right pane (the right area shows the thread instead). Closing the thread restores the split.
  - **Right pane is "view-only" for v1** — internal navigation (clicking a member's name to start a DM, clicking a #channel reference, etc.) routes to the **left pane**. This avoids ambiguous "where does this open" semantics. The right pane changes only when you explicitly close it or open something new in split.

### Implementation notes
- Lives entirely in `client/src/components/workspaces/WorkspaceView.jsx` + a single new prop (`onOpenInSplit`) on `Sidebar.jsx`. Zero changes to `ChannelView`, band view components, or the server.
- The divider drag uses document-level `mousemove`/`mouseup` listeners (so the drag continues if the cursor briefly leaves the divider). Body `cursor` and `userSelect` are pinned during drag so the cursor doesn't flicker over text.
- `resolveSplitSelection()` is defined just before the render block (not as a `useCallback` at the top) because it depends on handlers declared further down the component — putting it earlier would TDZ on those refs.

## [1.06.82] - 2026-05-09

### Added
- **Mobile build/submit npm scripts** — Four new scripts in `mobile/package.json`:
  - `npm run build:ios` — local EAS build (no cloud quota)
  - `npm run build:android` — local EAS build with `ANDROID_HOME` inlined as a fallback so it works from any shell
  - `npm run submit:ios` — auto-picks the most recent `build-*.ipa` and submits to App Store Connect
  - `npm run submit:android` — auto-picks the most recent `build-*.aab` and submits to Play Store
  - `--auto-submit` is intentionally NOT used because EAS doesn't support it with `--local` builds; the workflow is always `build` then `submit`.

### Note on version line
- v1.06.81 in TestFlight / Play Store production track is the **hotfix branch** (`hotfix/v1.06.81-revert-push-timing`) — built from v1.06.74's exact commit with only the version number bumped, to roll back v1.06.75's broken push-register timing. Confirmed working on device by user.
- The `v1.06.81` commit on `main` (`8e9fdfc7`) carries the same revert *plus* Tier 1–5 review work; it was never built/submitted. To ship Tier 1–5 we need a fresh build from `main` at `v1.06.82+` after on-device smoke-testing.

## [1.06.81] - 2026-05-09

### Reverted
- **v1.06.75's mobile push-registration timing changes** — Confirmed via on-device test that v1.06.74 (App Store) works flawlessly while v1.06.75 (TestFlight) is severely degraded: auth takes ages, workspace selection spins forever, channel taps either hang on a spinner or don't register at all, and tap responsiveness across the app is inconsistent. The only material mobile diff between v1.06.74 → v1.06.75 was adding `notificationService.register()` to two new lifecycle hooks (the `AppState 'active'` foreground handler in `App.js` and a `useEffect` on `user?.id` in `AuthContext.js`). Both reverted; mobile is now functionally identical to v1.06.74.
- **Server-side push improvements (chunk retry + structured logging) are kept** — they live on Railway and are independent of this revert.

### Why
The "sporadic notifications" issue v1.06.75 was meant to fix is real (registration races against session restore at app mount), but the chosen fix interacts badly with `expo-notifications`' native behavior on physical devices in a way I can't fully diagnose from code alone. Symptoms suggest repeated `register()` calls saturate the JS thread or block on a serialized native bridge call. We need to revisit with a smaller, on-device-tested change — not retry the same approach blind.

### Lessons / process
- v1.06.75 was committed → built → submitted without anyone running the build on a real device first. The bug was visible on launch — would have been caught in 30 seconds of manual testing. Future mobile changes that touch app-lifecycle hooks (AuthContext, App.js, AppState handlers) must be smoke-tested on a real device before submission.

## [1.06.80] - 2026-05-09

### Tests — green across the board
Ran the full test suite for the second-pass review. Mobile was 165/174 with 9 failures from outdated tests + a code/test mismatch; fixed all of them (now 176/176). Web passes 251/251. Server tests need a local Postgres test DB so they're not run here, but server logic touched in v1.06.76 (thread-read query) and v1.06.75 (push retry) is straightforward enough to be covered by the existing committed test files when CI picks them up.

#### Fixed
- **`utils/formatDuration.js`** — Returned `''` for falsy input; tests asserted `null`. Changed to `null` (more idiomatic JS — null = "no value", '' = "the empty string value"). All callers already guard with `?:` or `||`, so behavior at call sites is unchanged.
- **`services/__tests__/storage.test.js`** — Tests were written before the `AsyncStorage` fallback was added to `setItem`/`removeItem`. Old tests asserted `false` on SecureStore failure, but the function now legitimately falls back to AsyncStorage and returns `true` if the fallback succeeds. Replaced each with two tests: one for the fallback-success path, one for the both-stores-fail path.
- **`context/__tests__/ToastContext.test.js`** — Missing mocks for `@expo/vector-icons` and `./ThemeContext` caused the `require('../ToastContext')` chain to fail at parse time. Added stub mocks for both.

### Code review — second pass (post-Tier-1-4)
Spawned a fresh **security audit** (13 categories) and **robustness/edge-case audit** (10 categories) that explicitly included a regression check on the v1.06.76–v1.06.79 changes. Top findings, with verification:

#### Security agent's claims
- **`/api/push/vapid-key` unauthenticated** — by design. The VAPID *public* key is meant to be readable by any client that wants to subscribe; it's the *private* key that's secret (and is never exposed). False positive.
- **Reaction route lacks rate limiter** — already covered by the global `apiLimiter` mounted at `app.use('/api', apiLimiter)` (5000 req/15min/user, per CLAUDE.md). Not unbounded; bounded at the platform level. False positive.
- **CSRF via `sameSite: 'none'` refresh cookie** — required for the cross-origin Railway deployment. Mitigated in practice because all state-changing endpoints take JSON bodies (CORS preflight blocks naive `<form>` cross-site submission) and require the `Authorization` Bearer header (which a CSRF attacker can't forge from a third-party page). Acknowledged residual risk on rare GET-with-side-effects routes; nothing critical found.
- **Admin login brute-force** — agent speculated without finding the actual route. Not verified. Skipped.
- **Concurrent invite-link race** — real but low-stakes for a band-management app (worst case: a 1-use invite admits 2 people if they click within ~50ms). Not exploitable for security; UX edge case at most. Logged for a future fix.

#### Robustness agent's claims
- **`WorkspaceView.jsx:502,506` first-channel crash** — agent confirmed the guard already exists. False positive.
- **GigForm timezone handling** — real but a large redesign; out of scope for this review. Logged.
- **Message stuck in "Sending..." on socket drop** — real UX gap. Logged for a follow-up; out of scope here.
- **GigArchive setlist-name regex parsing** — string parsing of free-form names is best-effort by design.

#### Regression check on v1.06.76 – v1.06.79
Agent specifically reviewed: theme-color contrast bumps, server thread-read query rewrite, `formatDate` module-scope move, `WorkspaceView` lazy-load, `SetlistList` div→button, `AccessibilityInfo.isReduceMotionEnabled`, the TouchableOpacity → PressableRow sweep. **No regressions identified.**

### Net
176/176 mobile + 251/251 web tests green. Audit's flagged items were mostly false positives (already-mitigated, by-design) or out-of-scope follow-ups; the few real issues are noted in this entry rather than silently filed away.

## [1.06.79] - 2026-05-09

### Code review — Tier 4 (polish)

#### Accessibility
- **Mobile: `LayoutAnimation` honors "Reduce Motion"** — `AppearanceScreen.handleToggleCustomTheme` now checks `AccessibilityInfo.isReduceMotionEnabled()` before configuring the layout animation. Users with the OS-level Reduce Motion setting enabled get an instant transition instead of the eased one — matches the OS-wide promise the setting makes.
- **Web: skip-to-content link added** to `client/src/App.jsx` (WCAG 2.4.1). Hidden by default (`sr-only`), revealed and pinned at the viewport top-left when focused via Tab, jumps to the new `<main id="main-content">` wrapper. Keyboard users can now bypass nav on every page without tabbing through it.

#### Performance
- **Web: `WorkspaceView` lazy-loaded.** It's the largest single component in the app (the entire chat surface — sidebar, channel list, message list, threads, all sub-screens). Was imported eagerly in `App.jsx`, meaning a logged-out user hitting `/login` downloaded the whole chat client up-front. Now loaded on demand when the user navigates to `/workspace/...` — shrinks the initial bundle for auth/landing/legal routes substantially.

### Notes — Tier 4 false positives
- **Mobile toast missing `accessibilityLiveRegion`** — checked, already present (`accessibilityLiveRegion="polite"` in `mobile/src/context/ToastContext.js:81`).
- **Touch targets <44pt on `ChannelItem` / `WorkspaceSwitcher` badges** — badges are visual indicators inside an already-tappable row; they aren't separately interactive, so `hitSlop` doesn't apply.
- **`ErrorBoundary` hardcoded `#6366f1`** — intentional: the boundary needs to render even when ThemeContext is broken (it's the catch-all for app crashes). A theme-coupled color would defeat the purpose.
- **`MessageBubble` swipe-action `#f59e0b`** — semantic warning amber, kept consistent across themes by design.
- **`MessageList`'s `att.thumbnailUrl || att.url` fallback** — the right structural fix is on the server (R2 thumbnail generation reliability), not in the client. Out of scope for this review.

### Code review summary (v1.06.76 – v1.06.79)
Four tiers of fixes across web, mobile, and server: WCAG AA contrast, Material Design ripple feedback, screen-reader labels, performance, and code quality. Several agent-flagged items turned out to be false positives — verified and noted in each tier's changelog. Net result: ~70 files touched, real accessibility/perf gains, no regressions in the audit's strict-pass items.

## [1.06.78] - 2026-05-09

### Code review — Tier 3 (medium-impact, specific segments)

#### Android — TouchableOpacity → PressableRow / Pressable+ripple
Material Design ripple feedback now lands consistently on the band screens. Replaced ~61 `TouchableOpacity` instances across 5 files:

- **`GigDetailScreen.js`** — 30 to `PressableRow` (form pickers, date shortcuts, lock toggle, venue/setlist link rows, attachment rows, gig action buttons), 2 to `Pressable`+ripple (small chip-style toggles, "View All" link).
- **`SongListScreen.js`** — 13 to `PressableRow` (sort, more menu, action sheet items, bulk import), 4 to `Pressable`+ripple (segmented view-mode buttons, header cancel).
- **`SongDetailScreen.js`** — 8 to `PressableRow` (form Save/Cancel/Delete, link rows, practice modal), 6 to `Pressable`+ripple (audio play/pause/scrub icons, attachment chips).
- **`SetlistDetailScreen.js`** — 8 to `PressableRow` (Live Mode, Add Song, toolbar buttons, performer modal, edit-details modal), 3 to `Pressable`+ripple (inline edit links, song picker cancel).
- **`StagePlotEditorScreen.js`** — 2 to `PressableRow` (palette section header, palette item card).

Skipped where conversion would break behavior:
- `headerRight`/`headerLeft` buttons in `navigation.setOptions` (system-controlled context).
- Modal overlay backdrops with `activeOpacity={1}` (the overlay is a tap-target, not a button).
- Items inside `DraggableList` and other gesture-handler contexts (would conflict with the pan gesture).

#### Accessibility (web)
- **`SetlistList.jsx:1244` — `<div role="button">` → `<button>`** for setlist song rows. Adds proper semantic HTML (browser-native keyboard handling, screen-reader role) and removes the manual `tabIndex={0}` / `onKeyDown` ENTER plumbing. Tailwind classes adjusted to neutralize default browser button styles (`bg-transparent border-0 text-left w-full`).
- `MemberHoverCard.jsx`'s `<div role="button">` was the other flagged site, but it turns out the component is dead code (no imports anywhere in the repo). Left as-is; flagging for cleanup.

### Notes — false positives in the audit
The Tier 3 audit also flagged several items that turned out to be already correct or intentional design:
- `SafeAreaView` on `LyricsScreen` / `LiveModeScreen` — these are deliberately immersive (status bar hidden, full-screen lyrics / on-stage live mode). Manual inset handling is correct here.
- `ChannelScreen` already uses `useSafeAreaInsets()` correctly.
- Hardcoded greens/reds/yellows in `UpgradeScreen` / `WebsiteSettingsScreen` / `EditProfileScreen` are *semantic* status colors (success / error / warning) — those should NOT track the workspace theme.
- `Switch` components in `AppearanceScreen` and `NotificationsScreen` already have `accessibilityLabel`.
- `server/src/routes/gigs.js:261` already has `take: 500` on the deep `findMany` — flagged as "no take", which was wrong.

## [1.06.77] - 2026-05-09

### Code review — Tier 2 (high-impact, common-case)

#### Accessibility
- **Mobile: 38 `<Image>` components audited.** 7 got descriptive labels (`accessibilityLabel="Profile photo of <name>"`, `"Gig photo"`, etc.) on settings, gig, venue, pinned-messages, saved-messages, and share-receive screens. 20 marked decorative (`accessible={false}`) where the parent Pressable already provides the label — avoids duplicate VoiceOver/TalkBack readout. 11 already had labels and were left alone.
- **Web: 14 icon-only formatting buttons** in `MessageInput.jsx` (compose toolbar) and `MessageList.jsx` (edit toolbar) had only `title=` (mouse hover, invisible to screen readers). Added `aria-label="Bold"`, `"Italic"`, etc. alongside the existing `title` so keyboard-only and screen-reader users hear meaningful names.
- **`maxFontSizeMultiplier={1.0}` blockers:** raised to `1.3` on emoji picker glyphs, channel/workspace unread badges, and DM avatar initials. `1.0` completely disables Dynamic Type scaling for those elements.

#### Android UX
- **12 success-only `Alert.alert` calls → toasts** across 11 files (settings, gigs, songs, timeline, security, invites, image viewer). Material Design / Android UX expects transient toasts for success feedback, not modal dialogs the user has to dismiss. Errors, destructive confirmations, multi-button choices, permission prompts, and limit warnings all stay as `Alert.alert` (correctly modal). ~221 Alert calls audited; ~209 stay (categorized: errors, multi-button confirms, validation, permissions, instructional).

#### Performance
- **`AllMessages` / `ActivityFeed`: `formatRelativeDate` moved to module scope.** Was redefined inside the function body and called from `.map(items)`, allocating a new closure per item per render. Now a stable function reference; eliminates 50–100 closure allocations per render on the activity feed.

## [1.06.76] - 2026-05-09

### Code review — Tier 1 (critical, every-user impact)

#### Fixed
- **Dark-mode contrast (WCAG AA)** — `textSecondary: '#9ca3af'` on `bgTertiary: '#374151'` was 3.8:1, below the 4.5:1 AA threshold. Bumped to `#d1d5db` in both web (`client/src/context/ThemeContext.jsx`) and mobile (`mobile/src/context/ThemeContext.js`) — now ~6.1:1 on tertiary, even better on the more common bgPrimary/bgSecondary surfaces. Also bumped `--color-text-muted` in `client/styles/main.css` from `#9ca3af` to `#b8c0cc` for the same reason. Light-mode values unchanged (already passing).

#### Improved
- **Server: thread-unread query batched** — `GET /messages` previously issued one `prisma.message.count` per thread for users with custom thread-read timestamps (parallel, but still N round-trips on a chatty channel). Replaced with a single `findMany` against the earliest read time across all threads, with per-thread tallying in JS. For users tracking many threads this collapses N+1 queries into one, removing a noticeable latency component on initial channel load.

### Notes
- Performance audit flagged ThemeContext as missing memoization — verified false; both web and mobile already memoize `contextValue` and all callbacks correctly. No change made.

## [1.06.75] - 2026-05-09

### Fixed
- **Mobile push notifications: sporadic delivery (critical)** — Root cause: `notificationService.register()` ran from `App.js`'s mount-time `useEffect`, which fires *before* `AuthContext` finishes restoring the session from secure storage. The POST to `/push/expo-token` therefore had no auth header and 401'd silently — the error was swallowed. Whether registration succeeded depended on a race between session restore and the mount effect, which is exactly what users experienced as "sporadic." Re-logins after logout had the same problem in reverse: `unregister()` cleared the server token, but nothing re-registered until the next cold launch.

  **Fixes:**
  - **Hook registration into auth lifecycle** — `AuthContext` now runs `notificationService.register()` whenever `user?.id` becomes truthy (covers session restore, login, signup, Google/Apple OAuth, and re-login after logout). The mount-time call in `App.js` stays as a fast-path for already-authenticated cold starts; both are idempotent (server upserts by token).
  - **Self-heal on foreground** — `App.js`'s `AppState 'active'` handler now calls `register()` alongside the badge sync, so a previously failed registration (network blip, server outage) is recovered the next time the user comes back to the app.
  - **Surface real errors instead of swallowing** — `register()` no longer silently returns `null` on exception; logs `[push] register failed: ...` so misconfigurations (Expo project mismatch, missing FCM credentials) are visible in dev/prod logs.
  - **Server: chunk-level retry on transient errors** — `sendPushToUser` now retries each Expo chunk once on transient network errors (`ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`, `ENETUNREACH`, "fetch failed", "socket hang up") with a 800ms backoff. Non-transient errors (programmer mistakes) skip the retry; device-level errors come back as per-ticket details and trigger the existing `DeviceNotRegistered` / `InvalidCredentials` token cleanup.
  - **Server: structured per-send logging** — Single summary line per user-send: `[push] expo userId=… category=… tokens=N sent=N failed=N removed=N`. Grep-able when triaging "my notification didn't arrive" reports. Per-ticket non-cleanup errors get their own warning line so we can see e.g. `MessageRateExceeded` if Apple/Google start throttling.

## [1.06.74] - 2026-05-07

### Fixed
- **Mobile Calendar: first row hidden under nav header (critical)** — In `GigListScreen` the filter chips lived in a sibling `ScrollView` above the `SectionList`. With `headerLargeTitle: true` on iOS, that meant *two* scroll views existed at the same level and iOS's auto-content-inset bound to the wrong one. The result: the first row was tucked under the navigation bar; pulling down revealed it momentarily, then it snapped back on release. Fix: filter chips are now the SectionList's `ListHeaderComponent` (so the SectionList is the unambiguous primary scrollable) and `contentInsetAdjustmentBehavior="automatic"` is set, matching the working pattern in `GigArchiveScreen`.
- **Mobile Video player: fullscreen / AirPlay buttons inert, scrubber inconsistent (critical)** — Inline videos used the deprecated `Video` component from `expo-av`, whose native-controls overlay is broken on Expo SDK 54+ (fullscreen and AirPlay/cast taps did nothing; play/seek state desynced). Migrated `MessageBubble.VideoAttachment` and `RecordingDetailScreen` to `expo-video`'s `VideoView` + `useVideoPlayer`, with `nativeControls`, `allowsFullscreen`, and `allowsPictureInPicture` enabled. Added the `expo-video` config plugin (`supportsPictureInPicture: true`) so PiP is registered with iOS. `Audio` from `expo-av` is unchanged — it's not deprecated and still works fine for voice messages and audio playback.

## [1.06.73] - 2026-05-07

### Added
- **Group mentions: `@channel` / `@here` / `@everyone`** — Notify everyone in a channel from a single message. Server-side push fan-out already worked, but the feature was undiscoverable; the client UX is now wired up on both web and mobile:
  - **Autocomplete:** Group mentions appear at the top of the @-suggestions list (above per-user matches) with a description like "Notify everyone in this channel". Filter narrows by prefix (`@ch` → channel only). Web supports keyboard nav (↑/↓/Enter/Tab/Esc); mobile uses tap.
  - **Rendering:** Group mentions render with a distinct warning-yellow pill (`text-yellow-400 bg-yellow-500/20` on web, `#f59e0b` on mobile) so the broadcast nature is visually obvious in the message list, in threads, and in mobile bubbles. Per-user mentions keep the existing blue/primary styling.
  - **Send confirmation:** Sending a message with `@channel`/`@here`/`@everyone` shows a confirmation prompt — `ConfirmDialog` on web, native `Alert.alert` on mobile — preventing accidental fan-out. Edits skip the confirm because the server doesn't re-fire push on message updates.
  - All three behave identically on the server (notify every non-muted channel member, sender excluded). `@here` is not yet "online-only" — that's a future refinement.
  - `parseMentions.js` (shared between client and mobile) now exports `GROUP_MENTIONS`, `buildGroupMentionRegex()`, and `containsGroupMention(text)`. New regex is case-insensitive and uses `\b` so `@channels` (plural) and email-style `user@channel.com` don't trigger broadcast. New tests cover both edge cases.

## [1.06.72] - 2026-05-05

### Documentation
- README mobile screen + component counts refreshed (44 → 55 screens, 15 → 18 components) to reflect current state including v1.06.70's Gig Archive screen and recent additions.
- CLAUDE.md screen count updated to 55. Feature-Parity Summary refreshed for May 2026: Messaging now 100% (full thread reply edit/delete on both platforms after v1.06.63), Gigs/Calendar bumped to 95% with Gig Archive parity (mobile v1.06.70).
- CLAUDE.md `MessageList` row-memoization note updated from "TODO" to "shipped v1.06.71" with maintenance guidance: anything new the row uses must go through `ctx` + useCallback or it'll silently bust the memo.

## [1.06.71] - 2026-05-05

### Improved
- **MessageList: extract `MessageRow` + `React.memo`** — Previously every socket event (a single emoji reaction by anyone) caused a full MessageList re-render, and since rows were inline JSX inside a giant IIFE there was no memoization boundary. At 5,000 messages that's a 100-200ms layout/style storm on every reaction. `MessageRow` is now a memoized component at module scope; per-row primitives (`isEditing`, `isHighlighted`, `isReactionPickerOpen`, `isPinned`, `isSaved`, `showSeenBy`, `seenByCount`, `showDateHeader`, `showUnreadDivider`, `editContent` only when editing) are passed inline; everything else (handlers + reference data) is bundled into a memoized `ctx` object. Stabilized handlers via `useCallback` and an `editingIdRef` so `handleSaveEdit` can read the current id without depending on `messages`. Net effect: a single reaction in a 5,000-message channel re-renders **1 row instead of 5,000**. Also: removed the dead `[editContent]` dep on `insertEditLinePrefix` (function reads `editContentRef.current`, not `editContent`) which was busting the ctx memo on every keystroke.

## [1.06.70] - 2026-05-05

### Added
- **Mobile Gig Archive screen (web parity)** — New band-view screen at Band → Gigs → Gig Archive (Pro-only, matching web). Card list of gigs+setlists merged on the same timeline as the web Gig Archive: setlists auto-link to matching gigs by `setlistId` or by date+venue/title fallback; standalone gigs become their own entries; sorted by date desc. Each card shows title + date, song-count + duration + pay badges, up to 5 performer avatars (initials or imageUrl) with overflow chip, first 3 song titles + "+N more...", and up to 4 media thumbnails (image/youtube/video/audio/link) — tapping the media row opens the existing `GigGalleryScreen`. Filter tabs: All / Past / Upcoming with live counts. Tablet uses `contentMaxWidth` for centered single-column layout. Read-only browse view in v1; add-gig / edit-performers / drag-drop upload deferred to a follow-up since the existing `GigDetailScreen` already covers per-gig edits.

### Improved
- **Mobile a11y: section labels** — `accessibilityRole="header"` added to remaining settings-screen section labels (`InviteScreen` 2 sites, `WebsiteSettingsScreen` 6 sites). Combined with the AppearanceScreen / NotificationsScreen / ChannelListScreen Quick Links pass from earlier, settings landmarks are now consistently announced to screen readers.

## [1.06.69] - 2026-05-04

### Improved
- **MessageBubble: 7 TouchableOpacity → Pressable + Android ripple** — Avatar tap, thread-reply count, YouTube thumbnail, image/audio/document attachments, and reaction badges now use `Pressable` with `android_ripple` for proper Material feedback. iOS opacity feedback preserved via `style={({pressed}) => ...}`. Outer wrappers stay inside the existing `GestureDetector` + `ReanimatedSwipeable` so swipe-to-reply / swipe-to-react gestures keep working.

### Documentation
- **CLAUDE.md TODO for `React.memo` extraction on MessageList rows** — Highest-value remaining web perf fix (eliminates the 5,000-row re-render storm on every reaction). Documented as a focused future PR with extraction plan; not safe to land alongside other refactors because of the ~30 closure dependencies and risk to the most-used component.

## [1.06.68] - 2026-05-03

### Improved
- **Dynamic Type support across the mobile app (361 props added)** — `maxFontSizeMultiplier` added to `<Text>` components in 15 files (auth/settings/workspace/band/messaging surfaces). Heuristic: 1.2 for badges/timestamps/counts/icons (tight layouts), 1.6 for headers/body/message content (reading), 1.5 elsewhere (default). Layouts now hold at AX5 instead of breaking.
- **Theme-bypass cleanup (8 substitutions across 6 files)** — Hardcoded `'#fff'` replaced with `colors.primaryText` where the text wasn't sitting on a saturated brand-color background. Sites: `MessageInput` send icon + mention-avatar initial; `ChannelListScreen` workspace + member avatars; `GigList` Copy URL; `SongList` Done; `SetlistDetail` "+ Song"; `WebsiteSettings` View Site. Intentional on-primary contrast on saturated brand colors and semi-transparent overlays kept verbatim.

## [1.06.67] - 2026-05-02

### Improved
- **Band screens: TouchableOpacity → PressableRow (69 sites across 15 files)** — Setlist/gig/song/poll/recording/announcement/medley/member/stage-plot/venue/kitty list rows, cards, action-sheet items, and picker rows now use `PressableRow` for proper Android Material ripple. Icon-only header buttons with `hitSlop`, FAB icons, and modal backdrops stay as `TouchableOpacity` (correct shape for those patterns). Brings the band-views surface area to parity with CLAUDE.md's PressableRow standard. `MessageBubble.js` migration deferred to v1.06.69 due to gesture-handler complexity.

## [1.06.66] - 2026-05-02

### Improved
- **iOS hit targets** — `MessageBubble.reactionBadge` 32 → 44pt (HIG min). `ChannelListScreen` `bandItem` and `calendarShortcut` rows 36-39 → 48pt `minHeight`.
- **Haptic feedback consistency** — `selectionFeedback()` on every send (was silent) and on every reaction toggle (was inconsistent: voice-message start fired `mediumImpact` but reactions and send were silent). iMessage-style subtle pattern, not heavy impact.
- **Mic button: long-press only** — Tap path was a UX trap (accidental tap-to-record next to the typing input). Tap now fires `warningNotification` + an `accessibilityHint` directing to long-press.
- **`Alert.alert(success)` → `toast.success`** — `WebsiteSettingsScreen` (4 sites) + `UpgradeScreen` (2 sites). Alerts are reserved for conditions requiring acknowledgment; success messages should be transient toasts.
- **`MessageActionSheet` quick-reaction emoji row** — `TouchableOpacity` → `Pressable` with `android_ripple` to match the action rows below it (which already used `PressableRow`).

### Fixed
- **Android `KeyboardAvoidingView` no-op fixed across 18 screens** — `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` changed to `... : 'height'`. `undefined` was a no-op on Android — the keyboard could cover inputs on auth/settings/workspace screens. Files: `ForgotPassword`, `Signup`, `Login`, `EditProfile`, `WebsiteSettings`, `Invite`, `Security`, `GigDetail` (×2), `Timeline`, `RecordingDetail`, `MedleyDetail`, `SongDetail`, `VenueDetail`, `Kitty`, `ChannelSettings`, `Thread`, `Search`, `RecordingList`.

### Improved (web a11y)
- **Reply-count link unread state announced** — Was color-only (`text-slack-blue font-bold` vs `text-gray-500`); now `aria-label` includes "N unread replies" so screen readers convey the state too.
- **Unread-messages divider** — gets `role="separator" aria-label="New messages below"` so screen readers hear the boundary.
- **`SetlistList` toolbar emoji buttons** — `aria-label` on ✏️/✍️/📋/🗑️ (was `title`-only, NVDA default doesn't read `title`).
- **`Modal` supports `ariaDescribedBy`** — `ConfirmDialog` wires the message text through it; the confirm button now gets `aria-busy={loading}` while the action is in flight.
- **(untagged followups)** Search modal now `role="dialog" aria-modal="true"` with `aria-label="Search messages"`, search input properly labelled, Esc handler added (Modal-pattern parity), search button `aria-busy`. `ThreadView` edit textarea now shows visible "Enter save · Esc cancel" keybinding hint. `ChannelView.scrollToBottom` respects `prefers-reduced-motion`.

### Tests
- **Pagination auth/IDOR coverage** — `server/tests/messages.test.js` gains 3 cases: unauthenticated → 401, non-member → 403 (proves `isChannelMember` runs before cursor logic), and cross-workspace cursor reuse → no leak (Prisma's `cursor: { id }` with `channelId` filter silently produces an empty page when the cursor row doesn't match). Closes the test gaps from the 2026-05-03 security audit.

## [1.06.65] - 2026-05-03

### Improved (web a11y)
- **ThreadView landmarks + focus** — Root is now `<aside role="complementary" aria-label="Thread">`. Close button (`×`) and parent reaction button get `aria-label`. H3 → H2 (no H3 without H2 in the panel).
- **Avatars + display-name spans keyboard-accessible** — `role="button"`, `tabIndex`, `Enter`/`Space` handler, `aria-label`. Keyboard users can now open the member profile from any avatar/name in ThreadView (previously mouse-only).
- **`<main>` landmark** on `WorkspaceView`'s content column.
- **`prefers-reduced-motion` honored in JS-driven scrolls** — `ThreadView.scrollToBottom`, `MessageList` highlight scroll. CSS animations were already gated; JS scrolls weren't.
- **Color contrast (one CSS variable bump fixes dozens of components)** — `--color-text-muted` from `#6b7280` (~4.0:1 on `bg-tertiary` `#374151`, fails AA) → `#9ca3af` (~5.4:1, passes). Affects every "muted" label, hover toolbar, edited indicator across the app.

## [1.06.64] - 2026-05-03

### Fixed
- **Pagination duplicate-fetch race** — Fast scroll could fire 2-5 `loadMoreMessages()` calls before React committed `setLoadingMore(true)`, all passing the `!loadingMore` check. Replaced with synchronous `loadingMoreRef.current` flag set/cleared synchronously around the await. Plus defensive de-dupe in the prepend so a duplicate from any race condition, server retry, or out-of-order socket event can't surface twice.
- **`<video>` and `<audio preload="metadata">` → `preload="none"`** — Off-screen attachments were eagerly fetching metadata on initial render. Bandwidth and memory hit in music-heavy workspaces with many audio messages.

## [1.06.63] - 2026-05-02

### Added
- **Edit + Delete in thread replies (web)** — Hover toolbar on a reply now shows ✏️ Edit and 🗑️ Delete for messages you authored. Inline textarea (Enter to save, Esc to cancel), `(edited)` indicator, `ConfirmDialog` before delete. Mirrors the channel message UX. Mobile already supported this via the message detail navigation pattern.

## [1.06.62] - 2026-05-02

### Fixed
- **Thread panel layout broken on desktop** — Opening a thread exposed the body's white background and the channel column collapsed. Added `min-h-0`, `h-full`, and `bg-[var(--color-bg-primary)]` to the thread panel wrapper in `WorkspaceView.jsx` so the flex child properly constrains its internally-scrolling children. Mobile (`hidden md:flex` swap) was unaffected.

## [1.06.61] - 2026-05-02

### Fixed
- **Setlist song edits appeared not to save** — Clicking a song in a setlist opens `SongForm`, but `handleSongClick` looked up the song from the parent's `allSongs` prop first. After save, `allSongs` stayed stale, so re-opening showed the old data and looked like the save had failed. The save *was* persisting; the lookup just shadowed it. `handleSongClick` now uses `item.song` directly (the setlist API includes the full song object), and `handleSongSave` propagates updates to the parent via a new `onSongUpdate` callback so `allSongs` and dependent UI stay in sync.

## [1.06.60] - 2026-04-25

### Fixed
- **150-message DOM cap silently dropped paginated history** — `MessageList` capped rendered messages to the most recent 150 via `messages.slice(-150)`. Pagination prepends older messages to the array, but the slice always cut from the start, so anything past 150 was loaded into React state but never rendered. Caused pagination to appear to "stop" at 150 even on Pro workspaces with months of history. Cap removed. If perf becomes an issue at extreme scale, swap in proper windowed virtualization (`react-window` / `react-virtuoso`) — naive cap-from-end is worse than no cap because it actively breaks correctness.

## [1.06.59] - 2026-04-25

### Fixed
- **Channel scroll-up failed to load older messages** — `ChannelView` relied solely on `IntersectionObserver` for the infinite-scroll trigger. The observer fires once when the sentinel enters the viewport and doesn't refire until it exits and re-enters; combined with v1.06.58's cursor-validator bug, a single failed pagination attempt locked the entire channel's scroll-back permanently. Added a `scroll` event listener that fires `loadMoreMessages` directly when `scrollTop < 100`, with the existing observer kept as a backup.

## [1.06.58] - 2026-04-25

### Fixed
- **Cursor pagination broken for one month (latent since v1.05.77)** — A code review added `if (cursor.length < 20 || cursor.length > 30) return 400` to `GET /api/messages/channel/:channelId` on the false assumption that Message IDs were CUIDs. They're UUIDs (36 characters), so every cursor was rejected. The client's `loadMoreMessages` caught the 400 silently (no toast, no surfaced log), so users saw channels "stop" at 50 messages with no error. Replaced with `isValidUUID(cursor)` from `server/src/lib/validators.js`.

### Added
- **Pagination regression tests** — `server/tests/messages.test.js` gained a `describe('pagination')` block: initial-page semantics, full cursor walk surfacing every seeded message exactly once, invalid-cursor rejection, UUID-cursor acceptance (direct regression for the v1.05.77 defect), `hasMore=false`/`nextCursor=null` for small channels, `Cache-Control: no-store` header.

## [1.06.57] - 2026-04-25

### Fixed
- **HTTP 304 cache poisoning on `/api/messages/*`** — Express's default `ETag` revalidation caused browsers (and the PWA Service Worker) to cache an empty `{messages:[],hasMore:false}` body during the rate-limit storm; subsequent server responses with the same body got 304 Not Modified and the client's `hasMore` stayed permanently `false`, locking pagination state until users manually cleared site data. A `router.use` middleware on `/api/messages/*` now sets `Cache-Control: no-store` on every response.

## [1.06.56] - 2026-04-25

### Fixed
- **Rate-limiter per-user keying (real fix)** — v1.06.55 set `keyGenerator: (req) => req.user?.id || req.ip` on `apiLimiter`, but the limiter is mounted globally via `app.use('/api', apiLimiter)`, *before* per-route `authenticate`. `req.user` was always undefined at limiter time, so every authenticated user was still keyed by IP — just with a 5000 cap instead of 1000. The fix verifies and decodes the JWT inline in `keyGenerator` (reads `Authorization: Bearer <token>`, validates with `JWT_SECRET`/HS256, returns `u:<userId>` on success or `req.ip` on failure). Now genuinely per-authenticated-user.

## [1.06.55] - 2026-04-25

### Changed
- **Rate-limiter shape revisit (incomplete — see v1.06.56)** — Bumped `apiLimiter` from 1000 → 5000 requests / 15 min, attempted per-user keying, added `skip: req.method === 'OPTIONS'` so CORS preflights stop counting toward the cap. The keying didn't actually take effect because of middleware ordering; v1.06.56 fixed that.

## [1.06.54] - 2026-04-25

### Fixed
- **iOS app icon badge stuck at "10"** — The server-computed badge query introduced in v1.06.45 (`server/src/lib/unreadCount.js`) joined `ChannelMember → Channel → Workspace → Message` but never verified the user was still a `WorkspaceMember`. Three orphan `ChannelMember` rows from a workspace this user had left on 2026-03-14 (predating the cascade-cleanup added in v1.05.78) inflated the badge to 10 indefinitely. Added an `EXISTS (SELECT 1 FROM "WorkspaceMember" ...)` guard so orphan rows can never inflate the badge again, and deleted the three stale rows.
- **Setlist break labels rendered as "Set 1, Set 1, Set 2"** — Web setlist PDF (`SetlistList.jsx`) preferred the stored `breakItem.label` over the computed index. A historical bug (commit `e5d56c8e`, 2026-01-18) had stored auto-generated labels with off-by-one numbering. Normalized 29 stale auto-generated `Set N` labels in the database (`UPDATE "SetlistSong" SET label = NULL WHERE type = 'SET_BREAK' AND label ~ '^\s*Set\s*\d+\s*$'`) so all renderers fall back to `setIndex + 1` and produce the correct "Set 1, Set 2, Set 3."

## [1.06.42] - 2026-04-18

### Fixed
- **iPhone HEIC photo uploads** — Native iPhone camera-roll photos (HEIC/HEIF, default since iOS 11) were silently rejected by the upload magic-byte validator. Mobile now transcodes HEIC to JPEG on-device via `expo-image-manipulator` across every picker site (messages, camera, gig media, venue/profile/workspace avatars, website logo + hero). `ALLOWED_IMAGE_TYPES` on the server and web client also now includes `image/heic` / `image/heif` as a fallback.
- **WebsiteSettingsScreen uploadFile signature** — Was passing a `FormData` object as the `uri` argument. Corrected to match `(uri, filename, mimeType, workspaceId)`.

## [1.06.41] - 2026-04-18

### Added
- **Comment count badges on events** — `_count.comments` now surfaces on gig list/next/detail endpoints. Web shows a 💬 badge on `GigCalendar` compact rows, an inline count on list cards, and a dot on the Sidebar upcoming-event banner. Mobile shows the count on `GigListScreen` cards and the next-event banner in `ChannelListScreen`.
- **Long-press context menu on mobile comments** — Long-press on a `CommentItem` opens an ActionSheet (native on iOS / themed bottom sheet on Android) with Copy / Edit (own) / Delete (own or admin). Copy uses `expo-clipboard`.
- **Swipe-to-delete on mobile comments** — Own comments support left swipe via `ReanimatedSwipeable` revealing a destructive Delete. Non-own comments remain long-press only. Editing disables both gestures.

### Improved
- **BandMemberForm image cropper** — ESC now closes the fullscreen cropper; `role="dialog"`, `aria-modal`, `aria-labelledby` added.

## [1.06.40] - 2026-04-18

### Added
- **Mobile onboarding auto-launch** — New users with zero workspaces (and no pending invite code) are routed directly into `OnboardingWizardScreen` on login instead of an empty list. The empty state also gained prominent Create Workspace + Join with Invite Code buttons for users who back out.

### Fixed
- **Onboarding channel creation partial-failure handling** — `Promise.all` replaced with `Promise.allSettled` plus a `_created` flag on each channel so a single failure doesn't abort the batch, and retry only re-attempts missing channels (no duplicates). Error messages surface the specific failing channel when only one fails.

### Improved
- **OnboardingWizard Android feel** — `TouchableOpacity` migrated to `PressableRow` across header, footer, share/copy/send, add/remove channel, inline Create, and error-dismiss for proper Material ripple. `accessibilityState(busy/disabled)` added to async buttons.

## [1.06.39] - 2026-04-18

### Security
- **Personal-event comment privacy leak** — Comments on personal events were being broadcast to the whole workspace socket room and pushed to every member, leaking the event title and first ~120 chars of content. Socket + push audience now restricted to the creator and workspace admins via `resolveCommentAudience()` / `emitCommentEvent()` when `gig.isPersonal`.
- **Calendar Edit/Delete shown to non-creator non-admins** — Server auth was tightened in v1.06.35 to creator-or-admin, but `GigCalendar` still offered the controls to everyone. `canEdit`/`canDrag` updated to match.
- **Admin "purge now" now anonymizes GigComment** — The scheduled soft-delete job already did this; the admin endpoint was missed and left comments with `removedCreatorName` empty.

### Added
- **Rate limiting on gig comment list endpoint** — Added `apiLimiter` to `GET /:gigId/comments`, plus a 500-entry response cap (`take`) and a 1000-comments-per-gig cap at write time.

### Fixed
- **Duplicate comment on author's screen** — Optimistic POST append + subsequent socket `gig:commentAdded` event could render the comment twice. `handleAddComment` now dedupes by id on both web and mobile.
- **All Messages (mobile) didn't show recent messages at top** — Socket `message:new` handler filtered out your own posts, so posts you just sent never prepended. Removed the self-filter, added `useFocusEffect` refresh when returning to the screen, wired `message:updated` and `message:deleted` handlers, and added `contentInsetAdjustmentBehavior="automatic"` for iOS large title.
- **`window.confirm` for delete** in GigForm replaced with themed `ConfirmDialog`.

### Improved
- **Expanded emoji picker** — ESC handler, sticky search input, 7-col grid with Up/Down/Home/End keyboard nav, `aria-expanded`, `min(320px, 92vw)` width, focus ring. Android `Keyboard.dismiss()` before the picker opens so the bottom sheet doesn't sit above an open IME. Haptic feedback on emoji select and category tap. Deduplicated `🎶`/`💀`/`👍`/`👎`/`🙏` from multiple categories.
- **Gig comment UX polish** — Web comment list capped at `max-h-80 overflow-y-auto` with auto-scroll to newest when near bottom, `aria-live="polite"`, load-error state with Retry. Mobile `TextInput` capped at `maxHeight: 120`; `onContentSizeChange` keeps the Post button in view. Comments show relative time for <24h (`formatDistanceToNow`). TalkBack says "Your comment" for own comments.
- **iPad split-view threshold** — Lowered from `width >= 900` to `width >= 720` so Stage Manager and Split View multitasking widths (592–692pt) get the master/detail layout instead of snapping.
- **Mini-card touch target** — `minHeight: 48` on `SongListScreen` mini cards plus `maxFontSizeMultiplier: 1.5` on title/artist/badges.
- **Android comment UI ripple** — Post/Save/Cancel/Edit/Delete/Retry on `GigDetailScreen` migrated from `TouchableOpacity` to `PressableRow`.
- **Mobile unsent-comment guard** — `beforeRemove` navigation guard extended to warn on an unsent `newComment`, not just an active edit.
- **Theme variable migration** — `modal-input`, `modal-body`, `modal-label` now use `var(--color-text-*)` instead of hardcoded `text-gray-200`/`text-white`/`placeholder-gray-400`.

## [1.06.38] - 2026-04-14

### Added
- **Expanded emoji picker** — Web + mobile picker categories grew from 8 to 13 (reactions, smileys, hands, people, music, animals, nature, food, activities, travel, objects, symbols, text, flags).
- **Setlist song details from SetlistList** — Tapping a song inside a setlist opens the full `SongForm` modal for inline edits.

## [1.06.37] - 2026-04-14

### Improved
- **Gig comments P2 polish** — Accessibility grouping on comment items, locale-aware date formatting, toast on socket race when editing a comment someone else just updated.

## [1.06.36] - 2026-04-14

### Improved
- **Gig comments polish** — Socket listeners dedupe, push notifications, accessibility labels.

## [1.06.35] - 2026-04-14

### Added
- **Comments on calendar events** — Any workspace member can add comments to a gig/event. Authors can edit their own comments; authors or workspace admins can delete. Real-time updates via Socket.IO.

### Changed
- **Event edit/delete permissions tightened (breaking)** — Previously, any workspace member could edit or delete non-personal events they did not create. Now only the event creator or a workspace admin can modify or delete an event (personal or shared). Locked events still require admin.

## [1.06.08] - 2026-04-01

### Added
- **Workspace switcher dropdown** — Clicking the workspace name/icon in the sidebar (web) or header (mobile) now opens a Slack-like dropdown showing all your workspaces. Switch between workspaces with a single click instead of navigating to the workspace list page.
  - Shows workspace avatar, name, and unread message count for each workspace
  - Current workspace highlighted with checkmark
  - "All Workspaces" link for full workspace management
  - Keyboard navigation support on web (arrow keys, Enter, Escape)
  - Haptic feedback on mobile

## [1.06.06] - 2026-03-31

### Security
- **Email header injection prevention** — Added `sanitizeHeader()` function to remove newlines and special characters from email From/Subject headers in song request and contact form endpoints.
- **Improved email validation** — Replaced weak email validation (`includes('@')`) with proper regex validation.

### Improved
- **Timestamp in notification emails** — Song request and contact form emails now include "Received" timestamp so admins know when the submission arrived.
- **Mobile touch targets** — ActivityScreen cards now have `minHeight: 60` to ensure adequate touch target size per iOS HIG.

## [1.06.05] - 2026-03-31

### Added
- **Website song request & contact form endpoints** — Public endpoints for band websites to receive song requests and contact form submissions. Submissions are stored in the database and emailed to all workspace admins via Resend.
  - `POST /api/website/api/:workspaceId/song-request` — Accepts song title, artist, submitter name/email, notes
  - `POST /api/website/api/:workspaceId/contact` — Accepts name, email, subject, message
  - Rate limited to 20 submissions per hour per IP
  - Song requests only work if `features.songRequests` is enabled in website config
  - Contact form emails include `replyTo` header for easy responses
- **Database models** — Added `SongRequest` and `ContactSubmission` models (workspace-scoped, cascade delete)

### Fixed
- **Activity screen crash on mobile** — Tapping activity items (reactions, mentions, thread replies) crashed with "Cannot read property 'pinnedSetlist' of undefined". ActivityScreen was navigating to ChannelScreen with only `channelId` instead of a full `channel` object. Now constructs proper channel object with `id`, `name`, and `isDM`. Server activity endpoint now includes `isDirect` in response.

## [1.06.00] - 2026-03-26

### Fixed
- **Channel unread notifications wiped on workspace entry** — Clicking a workspace called `markWorkspaceRead()` which set ALL channels' `lastRead = now`, clearing per-channel unread counts before the user could see them. Removed the bulk mark-read call; workspace badge now clears client-side only, and individual channels mark as read when actually opened. Fixed on both web and mobile.

## [1.05.99] - 2026-03-26

### Added
- **ZIP file uploads** — Users can now upload ZIP files (max 10MB) in messages and gig media. Server validates magic bytes, stores in R2 `documents/` folder. Web shows document icon preview; mobile uses DocumentPicker with "File (PDF, ZIP)" attach option. Document attachments render as clickable download links on both platforms.

### Fixed
- **`--color-bg-hover` missing in dark mode** — CSS variable was only defined in light mode, causing invisible hover states across 10 components.
- **`Skeleton.Text` runtime crash** — GigStats used `Skeleton.Text` which doesn't exist. Replaced with base `Skeleton` component.
- **Toolbar buttons clipped** — `toolbarContainer.maxHeight: 36` clipped `minHeight: 44` toolbar buttons (mobile). Increased to 48.
- **Tailwind opacity on CSS variables** — `bg-[var(...)]/70` doesn't work with CSS vars. Replaced with `opacity-70` class in AvailabilityCalendar.
- **GigCalendar venue gap** — Venue was invisible between `sm` and `md` breakpoints. Changed `sm:hidden md:hidden` to `md:hidden`.
- **ContextMenu invalid ARIA** — `aria-selected` is not valid on `role="menuitem"`. Changed to `aria-current`.
- **Error haptic on cancel** — Destructive haptic fired before delete confirmation. Moved inside confirmed `onPress`.
- **Personal event leak on duplicate** — `POST /:gigId/duplicate` didn't check `isPersonal`, allowing duplication of others' personal events.
- **Cross-workspace setlist on gig setlist add** — `POST /:gigId/setlists` accepted setlists from any workspace. Now validates workspace ownership.
- **Locked gig setlist modification** — Gig setlist add/remove/reorder endpoints didn't check `isLocked`. Non-admins could modify setlists on locked gigs.

### Improved
- Star status included in ChannelItem parent `accessibilityLabel` (mobile VoiceOver).

## [1.05.98] - 2026-03-26

### Fixed
- **DKK currency rejected by server** — `validCurrencies` array was missing DKK, PLN, ILS, TWD, TRY, CZK, HUF, RON. Client offered these currencies but server returned 400.
- **EmbedCard cached null instead of data** — `embedCache.set(cacheKey, data)` stored stale React state (null) instead of the constructed embed object, defeating the cache entirely.
- **Personal event privacy leak** — `GET /api/gigs/:gigId` returned other users' personal calendar events. Now returns 404 if `isPersonal && createdById !== req.user.id`.
- **Cross-workspace setlist IDOR** — Gig create/update accepted setlist IDs without verifying they belong to the same workspace. Now validates workspace ownership.
- **Gig complete ignores lock status** — Locked gigs could be marked complete by non-admins. Now requires admin role for locked gigs.
- **Hardcoded dark-mode colors across 20 web components** — 157 `bg-gray-*`, `text-white`, `border-gray-*` classes migrated to CSS variable equivalents (`var(--color-bg-*)`, `var(--color-text-*)`, `var(--color-border)`). Fixes broken visuals in light themes for MemberProfile, PinnedMessagesPanel, ReactionDisplay, LinkPreviewCard, MobileNav, ChannelMembersPanel, AvailabilityCalendar, MedleyList, RecordingsList, GigCalendar, GigStats, SetlistBuilder, SongList, ContactsList, Achievements, BandTimeline, SongSuggestions, and more.
- **Auth screen title invisible in light mode** — Hardcoded `color: '#ffffff'` on LoginScreen, SignupScreen, ForgotPasswordScreen titles changed to `colors.textPrimary`.
- **ContactsList form error swallowed** — Save handler threw error that was never caught/displayed. Errors now propagate to ContactForm's catch block.
- **GigCalendar hid time and venue on mobile** — `hidden sm:block` removed critical info on narrow screens. Time now shown inline with date, venue as truncated secondary line.
- **GigArchive called autoLinkSetlists on every mount** — Now uses sessionStorage to run once per session.

### Security
- **Workspace import session ownership** — Verified existing check at `workspaceImport.js:168` (already had it).
- **Rate limiters on 8 route files** — Added `apiLimiter` to 30+ mutation endpoints on stagePlots, bandMembers, timeline, availability, medleys, channelGroups, practice, blocks.
- **JSON size validation** — Stage plot data capped at 100KB, website config at 50KB.
- **Input length validation** — Practice notes (2000 chars), push subscription endpoint/keys (2000/500 chars).
- **Unbounded gig queries** — Added `take: 500` to workspace and all-workspaces gig list endpoints.

### Accessibility
- ARIA `role="navigation"` + `aria-label` on Sidebar and MobileNav
- `role="list"` / `role="listitem"` on channel lists in Sidebar
- `aria-label` on ChannelView header buttons (search, pinned, members)
- `role="listbox"` / `role="option"` on ReactionPicker
- `aria-selected` on active ContextMenu item
- `role="tooltip"` + `aria-describedby` on MemberHoverCard
- `aria-current="page"` on active MobileNav tab
- `accessibilityRole="header"` on ChannelListScreen section headers (mobile)
- `accessibilityLabel="Starred channel"` on ChannelItem star icon (mobile)
- Error haptics (`errorNotification()`) on destructive actions: message delete, channel group delete, account delete, workspace leave/delete, gig delete (mobile)

### Added
- **Android notification channels** — Separate channels for Messages, Mentions, Events & Reminders, Announcements & Polls (users can independently control each in Android settings).
- **Error states** on SongSuggestions, ChannelMembersPanel, WorkspaceListScreen (mobile) with retry buttons.
- **GigStats loading skeleton** — Replaced plain text "Loading stats..." with Skeleton components.
- **Platform-specific quick action icons** — iOS uses SF Symbols, Android uses resource names.

### Improved
- Touch targets increased to 44px+ on SongList/GigCalendar action buttons (web), ImageViewer save/close (44dp), MessageInput toolbar (44dp), LinkPreview dismiss (32dp+hitSlop), DraggableList drag handle (44dp) (mobile).
- `keyboardDismissMode` added to EditProfileScreen, GigDetailScreen, SongDetailScreen ScrollViews (mobile).
- BiometricLockScreen uses SafeAreaView (mobile).
- Modal close button hover uses theme variable instead of hardcoded white (web).

### Removed
- Legacy `WRITE_EXTERNAL_STORAGE` Android permission (deprecated on API 33+, replaced by scoped `READ_MEDIA_*`).

## [1.05.97] - 2026-03-26

### Fixed
- **Gig media upload rejected YouTube/link URLs** — `addGigMedia` endpoint applied `isAllowedUploadUrl()` to all media types, but that only allows R2/Cloudinary domains. YouTube and external link URLs were silently rejected. Now only uploaded file types (image, audio, video) require storage provider URLs; youtube/link types just need valid HTTPS.
- **Multiple audio players could play simultaneously** — Each SongCard managed its own audio state independently. Now `playingSongId` is lifted to the parent SongList, enforcing single-player across both card and compact views.
- **`autoPlay` silently failed on mobile** — Toggling state to render `<audio autoPlay>` doesn't count as a user gesture on iOS/Android browsers. Removed `autoPlay`; users tap the native play control.
- **Media merge used `||` instead of `??`** — `updated.media || g.media` in GigCalendar treated empty array `[]` as falsy, so deleting all media from a gig showed stale data. Changed to nullish coalescing.
- **Song update/create wiped derived fields** — Server response for song update/create lacked `hasAudio`/`audioUrl`. Client now uses merge (`{ ...s, ...updated }`) instead of full replacement.
- **GET `/:gigId` missing media include** — Single gig endpoint did not include media in its response, inconsistent with list endpoints.
- **Duplicate gig endpoint used unordered `media: true`** — Now uses `media: { orderBy: { createdAt: 'desc' } }` consistently.

### Added
- **Clickable songs** — Tapping a song card or clicking a compact table row opens SongForm. If the song has audio, it opens directly to the Attachments tab for immediate playback.
- **Type-specific calendar media icons** — Calendar list and month views show colored per-type icons instead of generic paperclip: 📷 photos, ♫ audio (purple pill), ▶ YouTube (red pill), 🎬 video, 🔗 links. Icons are large and prominent.
- **Single song endpoint returns `hasAudio`/`audioUrl`** — GET `/:songId` now computes and returns these derived fields for consistency with the list endpoint.
- **Gig media input validation** — URL length (2048 chars) and caption length (500 chars) limits on `addGigMedia`.

### Accessibility
- `aria-expanded` on audio toggle buttons (card and compact views)
- `aria-live="polite"` on compact audio player row for screen reader announcements
- `aria-label` on `<audio>` elements with song title context
- `aria-label="Close audio player"` on close button (was missing)
- Dynamic `aria-label` on play buttons reflecting toggle state and song title
- `role="img"` + `aria-label` with attachment count on emoji media indicators
- Compact audio button touch target increased to 44px+ (was 16px)
- Close button touch target increased with padding
- Compact player row uses `flex-wrap` and truncatable label for narrow screens

## [1.05.84] - 2026-03-25

### Added
- **Audio indicator on song lists** — Songs with audio attachments show a musical note icon in both card and compact views on web and mobile. Server now returns `hasAudio` flag in song list response.
- **Scrubbable audio player (mobile)** — Tap anywhere on the progress bar to seek. Visual scrub handle shows current position.

### Fixed
- **Mobile audio playback** — Song audio attachments now play through speakers instead of earpiece. Added `Audio.setAudioModeAsync` with `playsInSilentModeIOS: true` before loading sound. Added loading spinner and error handling.

## [1.05.83] - 2026-03-24

### Fixed
- **Song attachment upload (web)** — Fixed broken upload that called non-existent API method. Now uses correct two-step flow: upload file to R2, then register as song attachment.
- **Song attachment file size** — Increased max from 10MB to 25MB on both web and mobile (server already allowed 30MB for audio).

### Added
- **Guitar Pro file support** — Web file picker now accepts `.gp`, `.gp3`–`.gp7`, `.gpx` files for song attachments.

## [1.05.82] - 2026-03-24

### Added
- **Mobile formatting toolbar** — Scrollable toolbar beneath the message input with: attach, photo library, bold, italic, strikethrough, inline code, @mention, and emoji buttons. Uses Ionicons, keeps keyboard open on tap.
- **Mobile markdown rendering** — MessageBubble now renders `**bold**`, `*italic*`, `~~strikethrough~~`, and `` `code` `` inline formatting. Code spans use monospace font with subtle background.

## [1.05.81] - 2026-03-24

### Added
- **Test database integration** — Server tests now run against a dedicated Railway PostgreSQL instance (Postgres-sxl9), keeping production data safe. Safety guard in `globalSetup.js` accepts `rlwy.net` hosts.

### Fixed
- **Contacts test category mismatch** — Test was sending uppercase `'VENUE'` but server validates lowercase categories since v1.05.80. Updated to `'venue'`.

## [1.05.80] - 2026-03-24

### Security
- **JWT algorithm pinning** — Explicit `algorithm: 'HS256'` on all `jwt.sign` calls to prevent algorithm confusion attacks.
- **Prisma select clauses** — 16 User queries in auth routes now fetch only required fields instead of full objects (excludes password hashes, tokens, etc. from memory).
- **Enum validation** — Gig type, gig status, and gig media type validated against whitelists on create/update. Contact category validated on update (was only on GET/create).
- **Privilege escalation fix** — Workspace admins can no longer reset system admin passwords.
- **Rate limiting expansion** — Added `apiLimiter` to mutation endpoints across 11 route files: channels, songs, gigs, setlists, announcements, polls, kitty, recordings, subscriptions, slackImport, push subscribe.
- **Contact category whitelist** — Corrected to match actual client values (`sound_engineer` not `sound`). Single module-level constant shared by all endpoints.

### Fixed
- **Android keyboard covers message input** — Changed `KeyboardAvoidingView` behavior to `undefined` on Android and `keyboardDismissMode` to `on-drag` (was `interactive`, Android-only).
- **OfflineBanner safe area** — Banner now respects safe area insets on notched devices. Slide animation offset increased to `-120` for large notches.
- **LinkPreview theme colors** — Dismiss button uses theme colors instead of hardcoded grays. Larger 14pt hit slop for easier tapping.
- **Currency null safety** — `getCurrencySymbol()` falls back to USD when code is null/undefined.
- **Reply swipe color** — Swipe-to-reply action uses `colors.primary` from theme instead of hardcoded blue.

### Added
- **Danish Krone (DKK)** — Added to currency list on both web and mobile.
- **Toast accessibility** — `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, and dismiss button labeling on all toast notifications.
- **OfflineBanner accessibility** — `accessibilityRole="alert"` and `accessibilityLiveRegion="assertive"` for screen reader announcements.
- **LinkPreview accessibility** — `accessibilityRole="link"` and descriptive label on link preview cards.

## [1.05.65] - 2026-03-22

### Added
- **Multi-photo upload** — Users can select up to 5 photos/videos per message on mobile (was single-file only). Preview row shows all selected thumbnails with individual remove buttons. Web enforces same 5-file cap.
- **Per-band themes** — Custom theme per workspace. Toggle in Settings > Appearance, auto-switches when navigating between bands. Web and mobile parity.
- **Unread badges on workspace list** — Unread message count per band, colored with the band's theme. Server calculates from unmuted channel `lastRead` timestamps. Marks all channels read on workspace entry.
- **Venue logos on printed setlists** — If a setlist's venue has an uploaded logo, it appears centered at the top of the printed/PDF setlist. All four print paths (web + mobile).
- **Formatting toolbar in message edit** — Edit textarea now has the same formatting toolbar as compose: bold, italic, strikethrough, code, code block, quote, bullet list. Keyboard shortcuts in edit mode.
- **Compact song list view** — Toggle between card grid and compact table view on both web and mobile. iOS segmented control, disclosure chevrons, full VoiceOver labels.
- **Song list PDF export** — Print/export song list as formatted PDF. Web uses print dialog; mobile uses expo-print + share sheet.
- **Admin dashboard: workspace admin email** — Workspaces tab shows admin name and email.

### Fixed
- **Image upload limit** — Increased from 10MB to 15MB (server + client).
- **Stale unread badges on mobile** — Added `markChannelRead` on socket reconnect, AppState listener on app foreground, and retry logic for failed mark-read calls.
- **iOS app badge always (1)** — Server now calculates actual unread count for push notification badge instead of hardcoding `badge: 1`.
- **Long-press on image-only messages** — Image attachment `TouchableOpacity` now supports `onLongPress` so users can react/reply to image-only messages. Fixed `handleLongPress` reference error (was out of scope in `renderAttachments`).
- **White background on All Messages scroll** — Added missing background color and overflow handling.
- **Duplicate venue on create** — Dedup check prevents socket event and API response from both adding the same venue.
- **Setlist print layout** — Unified both print paths. Single set: centered, 24px font, space-evenly. Multi-set: evenly distributed columns.
- **Message edit textarea** — Auto-sizes to fit content, grows as you type, allows manual resize.
- **LayoutAnimation on Android** — Added `UIManager.setLayoutAnimationEnabledExperimental(true)` in App.js.
- **Nested setState in setTheme** — Fixed anti-pattern of calling setState inside another setState updater (both platforms).
- **Edit toolbar cursor race** — `wrapEditSelection` uses ref for latest content, stable callback identity.
- **`isFollowingSystem` reactivity** — Now tracked as explicit state instead of reading stale localStorage.
- **Android empty state upside down** — Inverted FlatList empty component used `scaleY: -1` which rendered backwards on Android. Changed to `rotate: 180deg`.
- **Android keyboard covers input** — Added `softwareKeyboardLayoutMode: resize` to Android config and KAV `behavior: height` so keyboard doesn't obscure the message input.

### Changed
- **Theme-aware badge colors** — Added semantic badge colors (`badgeKey`, `badgeBpm`, `badgeDuration`) to theme system with WCAG AA contrast in both light and dark modes. Replaced 56 hardcoded hex values across 13 mobile files + web SongList.
- **Optimized unread queries** — Single raw SQL JOIN query instead of N parallel OR-clause queries per workspace. Push badge count also optimized.
- **Removed sidebar MEMBERS section** — Redundant with Settings > Members. Cleaned up unused imports, state, and blocked-users API call.
- **Avatars in Settings > Members** — Shows profile photos instead of just initial letters.
- **Theme-colored workspace cards** — Per-band theme colors on workspace list (left border accent on web, colored avatar on mobile).
- **Accessibility improvements** — Ionicons lock icon (was emoji), radiogroup label, tab roles on segmented control, dark mode toggle haptic, sign-out hitSlop 44pt.

## [1.05.46] - 2026-03-20

### Added
- **Compact song list view** — Toggle between card grid and compact table view on both web and mobile. Compact view shows numbered rows with title, artist, key, BPM, and duration. iOS-style segmented control for view toggle, disclosure chevrons on compact rows.
- **Song list PDF export** — Print/export song list as a formatted PDF. Web uses print dialog; mobile uses expo-print with share sheet ("Share as PDF" in More menu). Professional layout with band name header, numbered table, and song/duration totals. Table headers repeat on each page for long lists.

### Changed
- **Web filteredSongs memoized** — Song filtering and sorting wrapped in `useMemo` for better performance on large repertoires.

## [1.05.28] - 2026-03-18

### Fixed
- **Storage race condition** — `safeDecrementStorage` now uses atomic SQL (`GREATEST(0, ...)`) instead of read-then-write, preventing lost decrements on concurrent deletes.
- **Null dereference in messages** — Message route now uses `req.channel` from middleware instead of re-fetching, preventing crash if channel is deleted between middleware and route handler.
- **Cross-workspace personal event leak** — `/all-workspaces` gigs endpoint now filters personal events to only show the creator's own (matching single-workspace behavior). Also adds type/status enum validation.
- **Starred/unread channel duplication** — Channels shown in Starred or Unread sidebar sections no longer also appear in their group/ungrouped section. Group counts still reflect total membership.
- **Report dialog state** — Closing or cancelling the Report Message dialog now clears the reason text and error state.
- **Test database safety** — `globalSetup.js` now refuses to run tests unless `DATABASE_URL` contains "test", "localhost", or "127.0.0.1".

### Changed
- **Ionicons migration** — Replaced emoji icons with Ionicons (`@expo/vector-icons`) across 30+ mobile files: SettingsScreen, BAND_CATEGORIES, MessageActionSheet, all header buttons (+/... → add/ellipsis-horizontal), ChannelItem (lock, star, setlist), AppStack (header lock), UpgradeScreen (11 feature icons), ErrorState (new `iconName` prop), SignupScreen (checkbox), back buttons (chevron-back), empty states, attachment indicators, and all ErrorState callers.
- **Modal ARIA compliance** — Report dialog uses `Modal.jsx` (focus trap, portal, ARIA). LyricsModal rewritten with `createPortal`, focus trap, `role="dialog"`, `aria-modal`. Wizards and SettingsModal gain ARIA dialog attributes.

## [1.05.27] - 2026-03-17

### Added
- **Star channels** — Right-click to star/unstar channels. Starred channels appear in a dedicated "Starred" section at the top of the sidebar.
- **Unread section** — Channels with unread messages (non-muted, non-starred) appear in an "Unread" section below Starred.
- **Copy link** — Copy a direct link to any message via context menu. Navigating to the link highlights the message with a gold fade animation.
- **#channel references** — Typing `#channel-name` in messages creates clickable links that navigate to that channel.
- **Comprehensive test suite** — 388 tests across 35 files covering all route modules, authorization, compliance, plan gating, and soft-delete.

### Fixed
- **Toast feedback** — Toast shown on missing message navigation, star/unstar actions, and copy link.
- **Regex boundary** — Channel reference regex uses word boundary lookahead to prevent false matches.
- **No-results state** — Search and channel reference matching show helpful empty states.
- **Deleted workspace gigs** — Cross-workspace calendar excludes gigs from soft-deleted workspaces.
- **Admin dashboard CSP** — Content Security Policy updated for admin dashboard inline scripts.

## [1.05.24] - 2026-03-16

### Added
- **Website Builder** — Workspace admins can launch a professional band website from Settings > Website tab. Full deployment pipeline: GitHub repo creation from template, Vercel project setup, custom domain at `bandname.bandchat.app`, auto-sync on data changes.
- **11 genre design templates** — Rock, Grunge, Pop, Jazz, Covers, Country, Metal, Electronic, Funk/Soul, Reggae, Classical. Each with unique fonts, colors, and visual style.
- **Website config form** — Band name, tagline, description, location, genre, founded year, primary/secondary colors, social links, SEO fields, feature toggles, logo and hero image uploads.
- **Website data sync** — Gigs, songs, members, and setlists auto-sync to band websites. 5-minute debounce prevents rebuild storms. Manual "Sync Now" button available.
- **Website teardown** — One-click delete removes Vercel project, GitHub repo, and API tokens.
- **Pinned setlist set headers** — "Set 1", "Set 2" etc. now render before each set's songs with proper numbering. Set breaks show as visual dividers. Web and mobile.
- **Channel setlist indicator** — Green ♫ icon shows next to channels with a pinned setlist in sidebar (web) and channel list (mobile).
- **Settings tabs layout** — Two centered rows: general tabs (top) + admin-only tabs (bottom). Non-admins see a clean single row.
- **Deploy success modal** — "Your site is being built and will be live in 2-3 minutes" notification after deploying.

### Fixed
- **Biometric grace period** — Increased from 30 seconds to 5 minutes. Only triggers on actual background (not notification shade, control center, app switcher).
- **Screen preservation on re-auth** — Lock screen now overlays the app instead of replacing it. Users return to their current screen after FaceID/TouchID.
- **Image download** — Migrated from deprecated `expo-file-system` `downloadAsync` to new `File`/`Paths` API across all 5 files.
- **Swipe gesture directions** — Fixed swipe right = Reply (was incorrectly triggering Like), swipe left = Like.
- **Website data endpoint** — Filters to GIG type only (excludes rehearsals), stats computed from past gigs only.

### Added (v1.05.21–v1.05.24)
- **Blue flame custom emoji** — BandChat blue flame available as the first reaction in the emoji picker (web + mobile).
- **"thank you" text reaction** — Added to the text reactions category.
- **Multiple hero image uploads** — Drag-and-drop or multi-select for hero images in website config.
- **Media photo uploads** — Separate section for promo shots and band portraits alongside auto-synced gig photos.
- **Unread channels section** — New "Unread" section at top of mobile channel list showing channels with unread messages (DMs first).
- **Mobile setlist creation** — Date and venue fields added to the create setlist form.
- **Set break dividers** — Set breaks now render as clean line dividers instead of duplicating set labels.

### Fixed (v1.05.21–v1.05.24)
- **Message input safe area** — Input box no longer overlaps iOS home indicator on ChannelScreen and ThreadScreen.
- **KeyboardAvoidingView** — Added to 9 mobile screens (EditProfile, Security, Invite, ChannelSettings, Search, WorkspaceList, StagePlotEditor, RecordingList, ShareReceive).
- **Touch targets** — Availability badge (27pt→44pt), ChannelItem rows (39pt→44pt), filter chips (28pt→36pt), web header buttons increased.
- **Bottom safe area** — SetlistDetail edit toolbar and SongDetail view mode now respect home indicator.
- **Inline error states** — SongDetail, SetlistDetail, GigDetail now show retry instead of Alert+goBack.
- **Light mode colors** — Fixed hardcoded dark-mode colors in ConfirmDialog, Skeleton, MessageInput (~25 replacements).
- **Error retry** — Added ErrorMessage with retry to SongList, GigCalendar, SetlistList, BandKitty, PracticeDashboard.
- **Toast on errors** — Pin/unpin/save/unsave message actions now show toast on failure.
- **Tab overflow** — Settings modal tabs scroll on narrow screens.
- **Band website repos** — Now created as private (were public).
- **Website README** — Generic BandChat template instead of Frozen Assets.
- **Accessibility** — Labels on pinned setlist banner, profile avatar, TextInputs. aria-labels on web header buttons.

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
