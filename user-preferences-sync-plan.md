# User Preferences Sync — Implementation Plan

**Date:** 2026-06-21
**Status:** Plan only — not yet implemented
**Trigger:** Simon's directive: "make these settings part of the user profile. They should NEVER be tied to the app or the install. Sync all settings across devices and operating systems."

## 1. Inventory: what's currently per-device

Surveyed every `getUiString` / `setUiString` / `getUiState` / `setUiState` (mobile) and `storage.getJSON` / `storage.getString` etc. (web). Categorized by what should sync vs. stay per-device.

### Settings that SHOULD sync (server-backed user preferences)

| Key | Files | Type | Notes |
|---|---|---|---|
| `bandchat-mode` (Auto/Light/Dark) | mobile `ThemeContext.js`, web `ThemeContext.jsx` | string | The v1.07.19 modeSetting |
| `bandchat-theme` (Aubergine, Midnight, Cherry, etc.) | both ThemeContexts | string | Global theme |
| `bandchat-density` | mobile `ThemeContext.js` | string | Message density (default/comfortable/compact) |
| `bandchat-workspace-themes` | both ThemeContexts | JSON `{ [workspaceId]: themeId }` | Per-workspace theme overrides |
| `channelGroupSorts:<workspaceId>` | both `channelGroupSort.js` | JSON `{ [groupId]: 'ASC'\|'DESC'\|'CUSTOM' }` | v1.07.26 — Simon's most recent request |
| `collapsedGroups:<workspaceId>` | mobile `ChannelListScreen.js` | JSON `{ [groupId]: bool }` | Sidebar group collapse state |
| `collapsedBand:<workspaceId>` | mobile `ChannelListScreen.js` | bool | Band section collapse |
| `collapsedBandCats:<workspaceId>` | mobile `ChannelListScreen.js` | JSON `{ [catKey]: bool }` | Band category collapse |
| `collapsedDMs:<workspaceId>` | mobile `ChannelListScreen.js` | bool | DM section collapse |
| `collapsedQuickLinks:<workspaceId>` | mobile `ChannelListScreen.js` | bool | Quick links collapse |
| `collapsedStarred:<workspaceId>` | mobile `ChannelListScreen.js` | bool | Starred channels collapse |
| `bandchat_blocked_preview_domains` | mobile `useMessageActions.js`, web `MessageList.jsx` | string[] | Domains the user has dismissed for link previews |
| `bandchat-last-seen-version` | both `WhatsNewModal.js`/`jsx` | string | What's-new dialog stamp |
| `emojiFrequency` (web) / `recentEmojis` (mobile) | web `ReactionPicker.jsx`, mobile `storage.js` exports | varies | Used to surface frequently-used emojis first |
| `voice-tap-hint-shown` (referenced as plan; not in code yet) | future use | bool | First-tap voice mic hint — flagged in saved memory |
| `BIOMETRIC_PROMPT_SHOWN_KEY` | mobile `AuthContext.js` | string | "We already asked" flag — borderline; could argue per-device, but cleaner if synced (don't re-prompt on every new device) |
| `calendar-month-<workspaceId>` | web `GigCalendar.jsx` | string (ISO date) | Last viewed month in calendar. Debatable — current month is more useful per-device. Recommend NOT sync. |

### Settings that should STAY per-device (inherently device-bound)

| Key | Files | Why |
|---|---|---|
| `BIOMETRIC_ENABLED_KEY` | mobile `AuthContext.js` | Each device authenticates separately; FaceID on one phone doesn't enable TouchID on another |
| `scrollPos:<channelId>` | mobile `ChannelScreen.js` | Scroll restoration is a device-local UX detail |
| Auth tokens (SecureStore) | mobile `services/storage.js` default export | Per-device session — must not sync |
| Expo push tokens | mobile `notifications.js` | Per-device by definition |
| SQLite cache (`messages`, `channels`, `songs`, etc.) | mobile `services/database.js` | Local performance cache, not user data |
| Offline message queue | mobile `services/storage.js` | Per-device — about to be flushed |
| `lastWorkspaceId` / `lastWorkspaceName` | mobile `App.js` quick-actions | Last opened on THIS device — natural per-device |
| `recentEmojis` (mobile) / `emojiFrequency` (web) | Debatable | Could go either way. Recommend **per-device** for simplicity — emoji habits often differ between mobile (thumb-friendly) and desktop (keyboard) |
| `bandchat-last-seen-version` | Re-examining | Per-device makes more sense: "this device hasn't shown you what's new in v1.07.30 yet" |

**Reclassification:** on reflection, `recentEmojis`, `calendar-month`, and `lastSeenVersion` are better per-device. They describe state of *this device's UX*, not the user's account preferences.

## 2. Final scope to sync

| Category | Keys | Estimated scope |
|---|---|---|
| **Theme** | `mode` (Auto/Light/Dark), `theme` (palette), `density`, `workspaceThemes` map | 4 keys, 2 contexts to migrate |
| **Sidebar state** | `groupSorts` map, 6 collapse keys (`collapsedGroups`, `collapsedBand`, `collapsedBandCats`, `collapsedDMs`, `collapsedQuickLinks`, `collapsedStarred`) per workspace | 7 keys, 2 files to migrate |
| **Message UX** | `blockedPreviewDomains` | 1 key |
| **Auth UX** | `biometricPromptShown` | 1 key (mobile only) |

**Total: ~13 keys across ~6 files.**

## 3. Data model

### Server schema

Add to `User` model in `server/prisma/schema.prisma`:

```prisma
preferences  Json    @default("{}")
```

JSON column. Keys are user-defined dotted-path strings. Example shape:

```json
{
  "theme": {
    "mode": "auto",
    "global": "default",
    "density": "default",
    "workspaceThemes": { "<wsId>": "midnight" }
  },
  "sidebar": {
    "<wsId>": {
      "groupSorts": { "<groupId>": "DESC" },
      "collapsedGroups": { "<groupId>": true },
      "collapsedBand": false,
      "collapsedBandCats": { "songs": true },
      "collapsedDMs": false,
      "collapsedQuickLinks": false,
      "collapsedStarred": false
    }
  },
  "messages": {
    "blockedPreviewDomains": ["example.com"]
  },
  "auth": {
    "biometricPromptShown": true
  }
}
```

Rationale for nested shape: keeps related prefs grouped, makes the JSON readable in the DB, makes the server PUT endpoint accept partial updates via deep merge.

### Migration

`prisma db push` adds the column with default `{}`. No backfill needed — existing users get an empty object. First client GET returns empty; client then auto-migrates from local storage (see § 6).

## 4. API surface

```
GET  /api/me/preferences
  → 200 { preferences: { ... } }

PUT  /api/me/preferences
  body: { patch: { theme: { mode: 'dark' } } }
  → server deep-merges patch into user.preferences, persists
  → 200 { preferences: <merged> }
  → emits socket event `preferences:updated` to all of this user's
    other sockets (excluding the sender) with { patch }
```

Why PUT-with-patch instead of full replace:
- Conflict-free for concurrent updates from different devices (different keys)
- Server-side merge is just `lodash.merge` or a custom recursive merge
- Smaller wire payload per change

### Socket event

`preferences:updated` on the `user:<userId>` room. Server uses `socket.to(...)` so the originator doesn't receive an echo (matches the channel-message pattern). Payload: `{ patch }`. Client receives, deep-merges into local state, triggers re-render.

## 5. Client service shape

New file on each platform:

```
mobile/src/services/userPreferences.js
client/src/services/userPreferences.js
```

Both expose:

```ts
type PreferencesService = {
  // Hydrate from server. Called once after auth completes.
  load(): Promise<void>;

  // Synchronous reads from in-memory cache (loaded by `load`).
  get<T>(path: string, fallback: T): T;        // e.g. get('theme.mode', 'auto')

  // Optimistic local update + debounced server PUT.
  set(path: string, value: unknown): void;     // 500ms debounce per path

  // React hook for subscribing to changes (re-renders when path changes).
  useValue<T>(path: string, fallback: T): T;

  // Apply a server-pushed patch (called by SocketContext when
  // 'preferences:updated' arrives from another device).
  applyRemotePatch(patch: object): void;
};
```

Internals:
- In-memory state object (single source of truth on the client)
- Subscription list keyed by path → callbacks for `useValue`
- Outgoing patch queue with debounce per top-level key
- Backed by local storage as a write-through cache so the UI doesn't flash empty on cold start before the server GET resolves

## 6. Migration strategy (user picked: auto-migrate on first launch)

On first launch with the new client:

1. Client calls `GET /me/preferences`. Returns `{}` (no prefs yet on server).
2. Client reads each per-device key from local storage (the legacy values).
3. Client builds a single migration patch that includes everything it found.
4. Client calls `PUT /me/preferences` with that patch (the auto-migration).
5. Server stores it. Subsequent loads on this device or others return the merged blob.

After successful migration, client sets a `prefs.migrated = true` flag in local storage so step 2-4 only happens once per device.

**Race handling:** if two devices log in for the first time simultaneously and have different local values, last-write-wins at the server (the PUT that arrives second clobbers the first for any overlapping keys). For non-overlapping keys, both survive (deep merge). This is acceptable for v1; we can add server-side timestamps later if it becomes a problem.

## 7. Offline behavior

- Reads are always served from the in-memory cache (which is hydrated from local storage on cold start before the server GET). So even fully offline, the app reads the last known values.
- Writes are queued in local storage. When the client reconnects, the queue is flushed via PUT. No conflict UI — last-write-wins.
- If the server returns an error (5xx, auth, etc.), the local value is kept; we retry on next change or app foreground.

## 8. Phasing

Recommended order, each its own PR / batch:

1. **Server infrastructure** (~1 hour)
   - Schema: `User.preferences Json @default({})`
   - Routes: `GET /api/me/preferences`, `PUT /api/me/preferences`
   - Socket: emit `preferences:updated` on PUT
   - Test: hit the endpoints with curl

2. **Client preferences service** (~1.5 hours each platform)
   - `mobile/src/services/userPreferences.js`
   - `client/src/services/userPreferences.js`
   - Auto-migrate logic, debounced PUT, socket listener
   - React hook + subscription mechanism

3. **Migrate theme** (~1 hour each platform)
   - `ThemeContext.js` / `ThemeContext.jsx` switch from `getUiString`/`storage` to `preferences.get`/`set`
   - Auto-migrate copies `bandchat-mode`, `bandchat-theme`, `bandchat-density`, `bandchat-workspace-themes` into `theme.*` keys

4. **Migrate channel group sort** (~30 min each platform)
   - `channelGroupSort.js` helpers replaced with thin wrappers around `preferences.get('sidebar.<wsId>.groupSorts', {})`
   - Auto-migrate copies existing per-device map

5. **Migrate sidebar collapse state** (mobile only — web doesn't persist these in storage AFAIK) (~30 min)
   - 6 boolean/object keys
   - One-shot bulk patch in auto-migrate

6. **Migrate blockedPreviewDomains** (~15 min)
   - Both platforms

7. **Migrate biometricPromptShown** (~15 min)
   - Mobile only

**Total estimated work:** 6-8 hours focused work across 4-5 batches.

## 9. Risks + open questions

- **Performance of deep merge on the server.** For a small prefs blob (<100KB) trivial. Becomes a concern if we ever let users store arbitrary data (we won't — keys are well-defined).
- **Stale snapshot on cold start.** Until server GET resolves, the UI reads from local cache. Themes flash possible on first launch of a fresh install. Mitigate: render with `mode: 'auto'` default until prefs.load() resolves, ~200ms.
- **What if a user opens the app on Device A while signed out on Device B?** When Device B logs in next, it gets the latest server state, including Device A's changes. Good.
- **What about workspace-scoped prefs for users in many workspaces?** The JSON shape nests by workspaceId, so a user in 50 workspaces just has 50 nested objects. No issue at our scale.
- **Logout behavior.** Local cache is cleared on logout (same pattern as `clearTokens`). Next login re-hydrates from server.
- **PII / privacy.** Preferences are a tiny JSON blob. No sensitive info. Lives on the same backup tier as the User table.
- **Schema migrations.** Adding a new pref key has zero schema cost (just write `preferences.foo`). Removing a key requires a manual cleanup pass if we care to reclaim space.

## 10. Out of scope

- **Server-side per-device tracking.** We're not building "Device A doesn't yet know about this change" semantics. Either all devices get the merged blob via GET on next launch, or via socket while connected.
- **Conflict resolution UI.** Last-write-wins.
- **Preferences export / import.** Future feature if users want to back up their settings.
- **Admin override of user preferences.** Out of scope.

## 11. Decisions taken

- ✅ **Plan first, no code yet** (Simon, this turn)
- ✅ **Auto-migrate on first launch** (Simon, this turn)
- ⏳ Pending: which batch to start first (suggest: server infra, then theme migration as proof, then incremental)
