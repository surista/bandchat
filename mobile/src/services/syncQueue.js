import { getDatabase } from './database';
import dbEvents from './dbEventEmitter';
import api from './api';

const MAX_RETRIES = 5;

/**
 * Enqueue an offline mutation for later sync.
 */
export async function enqueue(operation, entity, entityId, payload, workspaceId) {
  const db = getDatabase();
  if (!db) return;
  await db.runAsync(
    `INSERT INTO sync_queue (operation, entity, entityId, payload, workspaceId, status, createdAt)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [operation, entity, entityId, JSON.stringify(payload), workspaceId, new Date().toISOString()]
  );
}

/**
 * Get count of pending items in the sync queue.
 */
export async function getPendingCount() {
  const db = getDatabase();
  if (!db) return 0;
  const row = await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
  );
  return row?.count || 0;
}

/**
 * Process all pending items in the sync queue.
 * Called on reconnect.
 */
export async function processQueue() {
  const db = getDatabase();
  if (!db) return;

  const items = await db.getAllAsync(
    "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY createdAt ASC"
  );

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);
      const result = await executeOperation(item.operation, item.entity, item.entityId, payload);

      // If we had a temp ID and got a real ID back, update local DB
      if (result?.id && item.entityId?.startsWith('temp-')) {
        await replaceTempId(item.entity, item.entityId, result);
      }

      // Remove from queue on success
      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);

      // Emit event so hooks re-render
      if (item.workspaceId) {
        dbEvents.emit(`${item.entity}s:${item.workspaceId}`);
      }
    } catch (err) {
      const retries = (item.retries || 0) + 1;
      if (retries >= MAX_RETRIES) {
        await db.runAsync(
          "UPDATE sync_queue SET status = 'failed', retries = ?, error = ? WHERE id = ?",
          [retries, err.message, item.id]
        );
      } else {
        await db.runAsync(
          'UPDATE sync_queue SET retries = ?, error = ? WHERE id = ?',
          [retries, err.message, item.id]
        );
      }
    }
  }
}

/**
 * Execute a single queued operation against the server API.
 */
async function executeOperation(operation, entity, entityId, payload) {
  switch (entity) {
    case 'message':
      if (operation === 'create') {
        return await api.sendMessage(payload.channelId, payload.content);
      }
      if (operation === 'update') {
        return await api.updateMessage(entityId, payload.content);
      }
      if (operation === 'delete') {
        await api.deleteMessage(entityId);
        return null;
      }
      break;
    case 'song':
      if (operation === 'create') {
        return await api.createSong(payload.workspaceId, payload);
      }
      if (operation === 'delete') {
        await api.deleteSong(entityId);
        return null;
      }
      break;
    case 'gig':
      if (operation === 'create') {
        return await api.createGig(payload.workspaceId, payload);
      }
      if (operation === 'delete') {
        await api.deleteGig(entityId);
        return null;
      }
      break;
  }
  return null;
}

/**
 * Replace a temp ID with the real server ID in the local database.
 */
async function replaceTempId(entity, tempId, serverRecord) {
  const db = getDatabase();
  if (!db) return;

  // Whitelist table names to prevent SQL injection
  const ALLOWED_TABLES = { message: 'messages', song: 'songs', gig: 'gigs' };
  const table = ALLOWED_TABLES[entity];
  if (!table) return;

  const data = JSON.stringify(serverRecord);

  // Delete the temp row
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [tempId]);
  // Insert the real row
  switch (entity) {
    case 'message':
      await db.runAsync(
        `INSERT OR REPLACE INTO messages (id, channelId, content, authorId, parentId, createdAt, updatedAt, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [serverRecord.id, serverRecord.channelId, serverRecord.content || '',
         serverRecord.author?.id || null, serverRecord.parentId || null,
         serverRecord.createdAt, serverRecord.updatedAt || serverRecord.createdAt, data]
      );
      break;
    case 'song':
      await db.runAsync(
        `INSERT OR REPLACE INTO songs (id, workspaceId, title, artist, updatedAt, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [serverRecord.id, serverRecord.workspaceId, serverRecord.title || null,
         serverRecord.artist || null, serverRecord.updatedAt || new Date().toISOString(), data]
      );
      break;
    case 'gig':
      await db.runAsync(
        `INSERT OR REPLACE INTO gigs (id, workspaceId, title, date, type, status, updatedAt, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [serverRecord.id, serverRecord.workspaceId, serverRecord.title || null,
         serverRecord.date || null, serverRecord.type || null, serverRecord.status || null,
         serverRecord.updatedAt || new Date().toISOString(), data]
      );
      break;
  }
}
