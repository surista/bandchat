import * as SQLite from 'expo-sqlite';

const SCHEMA_VERSION = 1;

let db = null;

/**
 * Open or create a per-user SQLite database.
 * Called after authentication, before socket connects.
 */
export async function openDatabase(userId) {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(`bandchat_${userId}.db`);
  await runMigrations(db);
  return db;
}

/**
 * Close the database (on logout).
 */
export async function closeDatabase() {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/**
 * Get the current database instance (null if not open).
 */
export function getDatabase() {
  return db;
}

/**
 * Run version-tracked migrations.
 */
async function runMigrations(database) {
  // Create meta table for version tracking
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const row = await database.getFirstAsync(
    'SELECT value FROM _meta WHERE key = ?', ['schema_version']
  );
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion < 1) {
    await migrateV1(database);
  }

  // Update version
  await database.runAsync(
    'INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)',
    ['schema_version', String(SCHEMA_VERSION)]
  );
}

async function migrateV1(database) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      name TEXT,
      isDirect INTEGER DEFAULT 0,
      unreadCount INTEGER DEFAULT 0,
      lastRead TEXT,
      lastMessageAt TEXT,
      data TEXT,
      updatedAt TEXT,
      deletedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      content TEXT,
      authorId TEXT,
      parentId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      deletedAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      updatedAt TEXT,
      deletedAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS gigs (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      title TEXT,
      date TEXT,
      type TEXT,
      status TEXT,
      updatedAt TEXT,
      deletedAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      userId TEXT NOT NULL,
      displayName TEXT,
      role TEXT,
      updatedAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      entity TEXT NOT NULL,
      entityId TEXT,
      payload TEXT,
      workspaceId TEXT,
      status TEXT DEFAULT 'pending',
      retries INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      workspaceId TEXT PRIMARY KEY,
      lastSyncedAt TEXT,
      initialSyncDone INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channelId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_songs_workspace ON songs(workspaceId);
    CREATE INDEX IF NOT EXISTS idx_gigs_workspace_date ON gigs(workspaceId, date);
    CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspaceId);
    CREATE INDEX IF NOT EXISTS idx_members_workspace ON members(workspaceId);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
  `);
}

// --- Channel helpers ---

export async function upsertChannel(channel, workspaceId) {
  if (!db) return;
  const data = JSON.stringify(channel);
  await db.runAsync(
    `INSERT OR REPLACE INTO channels (id, workspaceId, name, isDirect, unreadCount, lastRead, lastMessageAt, data, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [channel.id, workspaceId, channel.name || null, channel.isDirect || channel.isDM ? 1 : 0,
     channel.unreadCount || 0, channel.lastRead || null, channel.lastMessageAt || null,
     data, channel.updatedAt || new Date().toISOString()]
  );
}

export async function upsertChannels(channels, workspaceId) {
  if (!db || !channels?.length) return;
  await db.withTransactionAsync(async () => {
    for (const channel of channels) {
      await upsertChannel(channel, workspaceId);
    }
  });
}

export async function getLocalChannels(workspaceId) {
  if (!db) return [];
  const rows = await db.getAllAsync(
    'SELECT * FROM channels WHERE workspaceId = ? AND deletedAt IS NULL ORDER BY lastMessageAt DESC',
    [workspaceId]
  );
  return rows.map(r => ({ ...JSON.parse(r.data), _local: true }));
}

export async function deleteLocalChannel(channelId) {
  if (!db) return;
  await db.runAsync('UPDATE channels SET deletedAt = ? WHERE id = ?',
    [new Date().toISOString(), channelId]);
}

// --- Message helpers ---

export async function upsertMessage(message) {
  if (!db) return;
  const data = JSON.stringify(message);
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (id, channelId, content, authorId, parentId, createdAt, updatedAt, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [message.id, message.channelId, message.content || '', message.author?.id || message.authorId || null,
     message.parentId || null, message.createdAt, message.updatedAt || message.createdAt, data]
  );
}

export async function upsertMessages(messages) {
  if (!db || !messages?.length) return;
  await db.withTransactionAsync(async () => {
    for (const msg of messages) {
      await upsertMessage(msg);
    }
  });
}

export async function getLocalMessages(channelId, limit = 50, before = null) {
  if (!db) return [];
  let query = 'SELECT * FROM messages WHERE channelId = ? AND parentId IS NULL AND deletedAt IS NULL';
  const params = [channelId];

  if (before) {
    query += ' AND createdAt < ?';
    params.push(before);
  }

  query += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);

  const rows = await db.getAllAsync(query, params);
  return rows.map(r => ({ ...JSON.parse(r.data), _local: true })).reverse();
}

export async function deleteLocalMessage(messageId) {
  if (!db) return;
  await db.runAsync('UPDATE messages SET deletedAt = ? WHERE id = ?',
    [new Date().toISOString(), messageId]);
}

export async function updateLocalMessage(messageId, updates) {
  if (!db) return;
  const row = await db.getFirstAsync('SELECT data FROM messages WHERE id = ?', [messageId]);
  if (!row) return;
  const existing = JSON.parse(row.data);
  const merged = { ...existing, ...updates };
  const data = JSON.stringify(merged);
  await db.runAsync(
    'UPDATE messages SET content = ?, updatedAt = ?, data = ? WHERE id = ?',
    [merged.content || '', merged.updatedAt || new Date().toISOString(), data, messageId]
  );
}

// --- Song helpers ---

export async function upsertSong(song, workspaceId) {
  if (!db) return;
  const data = JSON.stringify(song);
  await db.runAsync(
    `INSERT OR REPLACE INTO songs (id, workspaceId, title, artist, updatedAt, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [song.id, workspaceId, song.title || null, song.artist || null,
     song.updatedAt || new Date().toISOString(), data]
  );
}

export async function upsertSongs(songs, workspaceId) {
  if (!db || !songs?.length) return;
  await db.withTransactionAsync(async () => {
    for (const song of songs) {
      await upsertSong(song, workspaceId);
    }
  });
}

export async function getLocalSongs(workspaceId) {
  if (!db) return [];
  const rows = await db.getAllAsync(
    'SELECT * FROM songs WHERE workspaceId = ? AND deletedAt IS NULL ORDER BY title COLLATE NOCASE',
    [workspaceId]
  );
  return rows.map(r => ({ ...JSON.parse(r.data), _local: true }));
}

export async function deleteLocalSong(songId) {
  if (!db) return;
  await db.runAsync('UPDATE songs SET deletedAt = ? WHERE id = ?',
    [new Date().toISOString(), songId]);
}

// --- Gig helpers ---

export async function upsertGig(gig, workspaceId) {
  if (!db) return;
  const data = JSON.stringify(gig);
  await db.runAsync(
    `INSERT OR REPLACE INTO gigs (id, workspaceId, title, date, type, status, updatedAt, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [gig.id, workspaceId, gig.title || null, gig.date || null, gig.type || null,
     gig.status || null, gig.updatedAt || new Date().toISOString(), data]
  );
}

export async function upsertGigs(gigs, workspaceId) {
  if (!db || !gigs?.length) return;
  await db.withTransactionAsync(async () => {
    for (const gig of gigs) {
      await upsertGig(gig, workspaceId);
    }
  });
}

export async function getLocalGigs(workspaceId) {
  if (!db) return [];
  const rows = await db.getAllAsync(
    'SELECT * FROM gigs WHERE workspaceId = ? AND deletedAt IS NULL ORDER BY date DESC',
    [workspaceId]
  );
  return rows.map(r => ({ ...JSON.parse(r.data), _local: true }));
}

export async function deleteLocalGig(gigId) {
  if (!db) return;
  await db.runAsync('UPDATE gigs SET deletedAt = ? WHERE id = ?',
    [new Date().toISOString(), gigId]);
}

// --- Member helpers ---

export async function upsertMember(member, workspaceId) {
  if (!db) return;
  const data = JSON.stringify(member);
  const userId = member.userId || member.user?.id;
  const displayName = member.user?.displayName || member.displayName;
  // WorkspaceMember has composite PK (userId, workspaceId) — use combined as local ID
  const localId = member.id || `${userId}_${workspaceId}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO members (id, workspaceId, userId, displayName, role, updatedAt, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [localId, workspaceId, userId, displayName, member.role || null,
     member.updatedAt || new Date().toISOString(), data]
  );
}

export async function upsertMembers(members, workspaceId) {
  if (!db || !members?.length) return;
  await db.withTransactionAsync(async () => {
    for (const member of members) {
      await upsertMember(member, workspaceId);
    }
  });
}

export async function getLocalMembers(workspaceId) {
  if (!db) return [];
  const rows = await db.getAllAsync(
    'SELECT * FROM members WHERE workspaceId = ?',
    [workspaceId]
  );
  return rows.map(r => ({ ...JSON.parse(r.data), _local: true }));
}

// --- Sync state helpers ---

export async function getSyncState(workspaceId) {
  if (!db) return null;
  return await db.getFirstAsync(
    'SELECT * FROM sync_state WHERE workspaceId = ?', [workspaceId]
  );
}

export async function setSyncState(workspaceId, lastSyncedAt, initialSyncDone = true) {
  if (!db) return;
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state (workspaceId, lastSyncedAt, initialSyncDone) VALUES (?, ?, ?)',
    [workspaceId, lastSyncedAt, initialSyncDone ? 1 : 0]
  );
}
