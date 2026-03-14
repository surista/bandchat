# Workspace-Scoped Backup & Restore Plan

## Problem

The current backup system (`server/src/services/backup.js`) is all-or-nothing. `createBackup()` dumps every record from every table. `restoreFromBackup()` truncates the entire database and re-inserts everything. If one band accidentally deletes their songs, the only recovery option destroys all other workspaces' data and replaces it with a potentially stale snapshot.

## Goal

Add the ability to back up a single workspace and restore it without touching any other workspace's data or any global records (users, achievements, etc.).

## What Changes, What Doesn't

**Unchanged:**
- Full-database backup system (daily automatic, manual trigger, retention, verification, alerting) — all stays exactly as-is
- Existing admin dashboard Backups tab layout — workspace backups get added below
- User-facing workspace export (`GET /workspaces/:id/export`) — that's for data portability, this is for disaster recovery
- Daily backup strategy remains full snapshots (not incremental) — at ~10 users this is fine

**New:**
- 5 functions in `backup.js` for workspace backup/restore
- 5 admin API routes in `admin.js`
- Workspace backup UI section in admin dashboard HTML + JS
- StagePlot added to full backup (currently missing — bug fix)

## Design Decisions and Why

### 1. Full Replace, Not Merge (on Restore)

When restoring a workspace, we delete all current data for that workspace and re-insert from backup. Merging would require conflict resolution on every record (which message is newer? which song version wins? what about deleted-then-re-created records?). For a band app with ~10 users, full replace is simple, predictable, and correct. The admin sees exactly what the workspace looked like at backup time.

### 2. User Stubs, Not Full User Records

Users are cross-workspace — the same user can be in multiple bands. The workspace backup stores `{ id, displayName, email }` stubs for every user referenced anywhere in the workspace data (message authors, reaction users, poll voters, etc.). On restore:
- If the user still exists in the DB → use their real ID (foreign keys work)
- If the user was purged → set the FK to null and populate `removedUserName` / `removedCreatorName` with the display name from the stub

This matches the existing anonymization pattern used by the soft-delete purge job in `index.js`.

### 3. Achievement Catalog is Global — Skip It

The `Achievement` table is a global catalog (not workspace-scoped). `MemberAchievement` and `BandAchievement` reference achievements by ID. On restore, we verify each `achievementId` still exists before inserting. If an achievement was deleted from the catalog, we skip that record. We never create or modify the global Achievement table during workspace restore.

### 4. Manual-Only, Max 5 Per Workspace

Full-database auto-backups already run daily and cover everything. Workspace backups serve a different purpose: an admin creates one before a risky operation, or as a checkpoint before a big reorganization. Automatic per-workspace backups would multiply storage (N workspaces x daily) with little benefit. Keep max 5 per workspace, simple count-based retention.

### 5. R2 Path Separation

- Full-database backups: `backups/backup-{timestamp}.json.gz`
- Workspace backups: `backups/workspace/{workspaceId}/backup-{timestamp}.json.gz`

The `listBackups()` function uses `Prefix: 'backups/'` and only returns files directly in that folder (not in subfolders), so workspace backups won't pollute the full-backup list. Workspace backups are listed with their own prefix.

### 6. R2 Files (Attachments, Images) Are NOT Bundled

The backup stores URLs to R2 files but doesn't copy the actual binary files. This is the same as the full-database backup. If R2 files are independently deleted, restored records will have broken URLs. This is an acceptable trade-off — R2 files are only deleted when records are deleted, and at that point the workspace backup still has the URLs.

### 7. Workspace Name Uniqueness Not Enforced

At ~10 users and 4 workspaces, enforcing unique names/slugs solves a problem we don't have. The admin UI disambiguates workspaces by showing member count, message count, and creation date alongside the name.

## What Gets Backed Up Per Workspace

All models with a direct or indirect `workspaceId` relationship:

| Model | Query Filter | Notes |
|-------|-------------|-------|
| Workspace | `id = workspaceId` | The workspace record itself (name, settings, plan, etc.) |
| WorkspaceMember | `workspaceId` | Composite key `(userId, workspaceId)` |
| ChannelGroup | `workspaceId` | |
| Channel | `workspaceId` | Including DM channels |
| ChannelMember | via Channel | `channel.workspaceId = X` |
| Message | via Channel | `channel.workspaceId = X`, batched 5000 |
| Attachment | via Message->Channel | |
| Reaction | via Message->Channel | |
| PinnedMessage | via Channel | |
| ThreadRead | via Message->Channel | |
| SavedMessage | via Message->Channel | |
| Song | `workspaceId` | |
| SongAttachment | via Song | |
| Setlist | `workspaceId` | |
| SetlistSong | via Setlist | |
| SetlistPerformer | via Setlist | |
| Medley | `workspaceId` | |
| MedleySong | via Medley | |
| Gig | `workspaceId` | |
| GigAttendee | via Gig | |
| GigSetlist | via Gig | |
| GigMedia | via Gig | |
| GigSong | via Gig | |
| BandMember | `workspaceId` | |
| InstrumentStint | via BandMember | |
| Contact | `workspaceId` | |
| Announcement | `workspaceId` | |
| AnnouncementAcknowledgment | via Announcement | |
| Poll | `workspaceId` | |
| PollOption | via Poll | |
| PollVote | via PollOption->Poll | |
| TimelineEvent | `workspaceId` | |
| Recording | `workspaceId` | |
| BandKitty | `workspaceId` (unique) | |
| KittyTransaction | via BandKitty | |
| MemberAchievement | `workspaceId` | |
| BandAchievement | `workspaceId` | |
| MemberAvailability | `workspaceId` | |
| PracticeSession | `workspaceId` | |
| StagePlot | `workspaceId` | |

**NOT backed up** (not workspace-scoped):
- User, RefreshToken, ExpoPushToken, PushSubscription (cross-workspace)
- Achievement (global catalog)
- Report, BlockedUser (user-scoped, not workspace-scoped)

## Backup JSON Format

```json
{
  "version": 1,
  "type": "workspace",
  "workspaceId": "uuid",
  "workspaceName": "My Band",
  "createdAt": "2026-03-14T...",
  "userStubs": [
    { "id": "uuid", "displayName": "Scott", "email": "scott@..." }
  ],
  "stats": {
    "channels": 5, "messages": 1200, "songs": 45, "gigs": 12,
    "setlists": 8, "members": 4, "bandMembers": 6
  },
  "data": {
    "workspace": { },
    "workspaceMembers": [ ],
    "channelGroups": [ ],
    "channels": [ ],
    "messages": [ ],
    "songs": [ ],
    "setlists": [ ],
    "gigs": [ ],
    "bandMembers": [ ],
    "contacts": [ ],
    "announcements": [ ],
    "polls": [ ],
    "timeline": [ ],
    "recordings": [ ],
    "medleys": [ ],
    "kitty": { },
    "kittyTransactions": [ ],
    "memberAchievements": [ ],
    "bandAchievements": [ ],
    "availability": [ ],
    "practice": [ ],
    "savedMessages": [ ],
    "threadReads": [ ],
    "pinnedMessages": [ ],
    "stagePlots": [ ]
  }
}
```

## Restore Algorithm (Detailed)

### Step 1: Download, Decompress, Parse
Same as full restore.

### Step 2: Validate
- Check `type === 'workspace'` and `workspaceId` matches expected
- Check version compatibility

### Step 3: Resolve User References
- Collect all user IDs referenced in the backup (from userStubs)
- Query DB: `SELECT id FROM "User" WHERE id IN (...)`
- Build a Set of existing user IDs
- For any user ID NOT in DB, null out FKs and set `removedUserName`/`removedCreatorName`

### Step 4: Check Workspace Existence
- If workspace exists -> update it and delete its children
- If workspace doesn't exist -> create it fresh

### Step 5: Delete Existing Workspace Data (Inside Transaction)

Targeted DELETE statements scoped to this workspace. Order matters due to foreign key constraints — delete children before parents:

```sql
-- Message tree (via Channel)
DELETE FROM "SavedMessage" WHERE "messageId" IN (SELECT id FROM "Message" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1));
DELETE FROM "ThreadRead" WHERE "messageId" IN (SELECT id FROM "Message" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1));
DELETE FROM "Reaction" WHERE "messageId" IN (SELECT id FROM "Message" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1));
DELETE FROM "Attachment" WHERE "messageId" IN (SELECT id FROM "Message" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1));
DELETE FROM "PinnedMessage" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1);
DELETE FROM "Message" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1);
DELETE FROM "ChannelMember" WHERE "channelId" IN (SELECT id FROM "Channel" WHERE "workspaceId" = $1);
DELETE FROM "Channel" WHERE "workspaceId" = $1;
DELETE FROM "ChannelGroup" WHERE "workspaceId" = $1;

-- Song tree
DELETE FROM "SongAttachment" WHERE "songId" IN (SELECT id FROM "Song" WHERE "workspaceId" = $1);
DELETE FROM "SetlistSong" WHERE "setlistId" IN (SELECT id FROM "Setlist" WHERE "workspaceId" = $1);
DELETE FROM "SetlistPerformer" WHERE "setlistId" IN (SELECT id FROM "Setlist" WHERE "workspaceId" = $1);
DELETE FROM "Setlist" WHERE "workspaceId" = $1;
DELETE FROM "MedleySong" WHERE "medleyId" IN (SELECT id FROM "Medley" WHERE "workspaceId" = $1);
DELETE FROM "Medley" WHERE "workspaceId" = $1;
DELETE FROM "Song" WHERE "workspaceId" = $1;

-- Gig tree
DELETE FROM "GigSong" WHERE "gigId" IN (SELECT id FROM "Gig" WHERE "workspaceId" = $1);
DELETE FROM "GigMedia" WHERE "gigId" IN (SELECT id FROM "Gig" WHERE "workspaceId" = $1);
DELETE FROM "GigSetlist" WHERE "gigId" IN (SELECT id FROM "Gig" WHERE "workspaceId" = $1);
DELETE FROM "GigAttendee" WHERE "gigId" IN (SELECT id FROM "Gig" WHERE "workspaceId" = $1);
DELETE FROM "Gig" WHERE "workspaceId" = $1;

-- Band members
DELETE FROM "InstrumentStint" WHERE "bandMemberId" IN (SELECT id FROM "BandMember" WHERE "workspaceId" = $1);
DELETE FROM "BandMember" WHERE "workspaceId" = $1;

-- Community
DELETE FROM "AnnouncementAcknowledgment" WHERE "announcementId" IN (SELECT id FROM "Announcement" WHERE "workspaceId" = $1);
DELETE FROM "Announcement" WHERE "workspaceId" = $1;
DELETE FROM "PollVote" WHERE "optionId" IN (SELECT id FROM "PollOption" WHERE "pollId" IN (SELECT id FROM "Poll" WHERE "workspaceId" = $1));
DELETE FROM "PollOption" WHERE "pollId" IN (SELECT id FROM "Poll" WHERE "workspaceId" = $1);
DELETE FROM "Poll" WHERE "workspaceId" = $1;
DELETE FROM "TimelineEvent" WHERE "workspaceId" = $1;
DELETE FROM "Recording" WHERE "workspaceId" = $1;
DELETE FROM "Contact" WHERE "workspaceId" = $1;

-- Finance & achievements
DELETE FROM "KittyTransaction" WHERE "kittyId" IN (SELECT id FROM "BandKitty" WHERE "workspaceId" = $1);
DELETE FROM "BandKitty" WHERE "workspaceId" = $1;
DELETE FROM "MemberAchievement" WHERE "workspaceId" = $1;
DELETE FROM "BandAchievement" WHERE "workspaceId" = $1;
DELETE FROM "MemberAvailability" WHERE "workspaceId" = $1;
DELETE FROM "PracticeSession" WHERE "workspaceId" = $1;
DELETE FROM "StagePlot" WHERE "workspaceId" = $1;

-- Workspace membership (but NOT the workspace record itself)
DELETE FROM "WorkspaceMember" WHERE "workspaceId" = $1;
```

### Step 6: Update or Create Workspace Record
- If workspace exists: `UPDATE` its fields (name, settings, plan, etc.)
- If workspace was purged: `INSERT` the workspace record

### Step 7: Insert Data

Follows same patterns as `restoreFromBackup()` in existing code, but:
- All data is scoped to one workspace
- User FKs get resolved: if user exists -> use ID, if not -> null + removedUserName
- Messages sorted by createdAt (parents before children)
- Batched in 500s for messages
- Achievement IDs verified against global catalog before inserting MemberAchievement/BandAchievement

### Step 8: Recalculate storageUsedBytes
Sum all attachment sizes for the workspace after restore.

## Insert Order (Dependency-Safe)

1. Workspace record (update or create)
2. WorkspaceMembers
3. ChannelGroups
4. Channels + ChannelMembers
5. Songs + SongAttachments
6. BandMembers + InstrumentStints
7. Messages (sorted by createdAt) + Attachments + Reactions
8. PinnedMessages
9. Setlists + SetlistSongs + SetlistPerformers
10. Gigs + GigAttendees + GigSetlists + GigMedia + GigSongs
11. Contacts
12. Announcements + Acknowledgments
13. Polls + Options + Votes
14. TimelineEvents
15. Recordings
16. Medleys + MedleySongs
17. BandKitty + KittyTransactions
18. MemberAchievements + BandAchievements
19. MemberAvailability
20. PracticeSessions
21. SavedMessages
22. ThreadReads
23. StagePlots

## Edge Cases

1. **Workspace doesn't exist anymore** — The restore creates it fresh. WorkspaceMembers reference user IDs — if those users still exist, they regain access. If not, those membership records are skipped.

2. **Message references deleted channel** — Can't happen. We restore channels before messages, and both come from the same backup snapshot.

3. **SetlistSong references a song from another workspace** — The schema allows `songId` to be nullable on SetlistSong. If the referenced song isn't in our backup (belongs to another workspace), we set `songId: null`. In practice this shouldn't happen since setlists and songs are in the same workspace.

4. **KittyTransaction references a gig** — `gigId` on KittyTransaction is optional. If the gig exists in the backup, the FK works. The gig is always in the same workspace.

5. **Poll has channelId** — Poll can optionally reference a channel. Since we restore channels before polls, this FK will be valid.

6. **GigSetlist references a setlist** — Both are in the same workspace. Restore setlists before gigs.

7. **Transaction timeout** — Use the same 10-minute timeout as full restore. For ~10 users, workspace data should restore in seconds.

8. **Concurrent workspace restores** — Add a `workspaceRestoreInProgress` Set (not just a boolean like full restore) tracking which workspace IDs are currently being restored. Reject if same workspace is already in progress.

## Files to Modify

### `server/src/services/backup.js`
Add 5 new exported functions:
1. `createWorkspaceBackup(workspaceId)` — query all workspace-scoped data, collect user stubs, gzip, upload to R2
2. `listWorkspaceBackups(workspaceId)` — list R2 objects with prefix `backups/workspace/{workspaceId}/`
3. `previewWorkspaceBackup(key)` — download, decompress, return stats (no full data)
4. `restoreWorkspaceBackup(key, onProgress)` — the full delete-and-reinsert flow
5. `cleanupWorkspaceBackups(workspaceId)` — keep max 5 per workspace

Also: add StagePlot to `createBackup()` and `restoreFromBackup()` (bug fix — currently missing).

### `server/src/routes/admin.js`
Add 5 new endpoints:
1. `POST /api/admin/workspaces/:workspaceId/backup` — trigger workspace backup
2. `GET /api/admin/workspaces/:workspaceId/backups` — list workspace backups
3. `POST /api/admin/workspace-backups/preview` — preview `{ key }`
4. `POST /api/admin/workspace-backups/restore` — restore with `{ key, confirmPhrase: 'RESTORE WORKSPACE' }`
5. `GET /api/admin/workspace-backups/download/:workspaceId/:filename` — download with path traversal protection

Also: add workspace backup cleanup to existing workspace purge handler.

### `server/src/admin/index.html`
Add workspace backup section below existing backups:
- Workspace selector dropdown (shows name + member count + msg count + created date)
- "Backup Now" button
- Table of workspace backups (date, size, download, restore)
- Restore modal with `RESTORE WORKSPACE` confirmation

### `server/src/admin/admin.js`
Add JavaScript for:
- `loadWorkspaceBackups(workspaceId)` — fetch and render
- Workspace selector change handler
- Backup trigger, download handler, restore modal/execution
- Same patterns as existing full-backup UI code

## Admin UI: Workspace Selector Display

To disambiguate workspaces with the same name, the selector shows:
```
Workspace Name — N members · N msgs · Created MMM YYYY
```
e.g.:
- "The Regulars — 5 members · 1,200 msgs · Created Jan 2025"
- "The Regulars — 3 members · 340 msgs · Created Nov 2025"
