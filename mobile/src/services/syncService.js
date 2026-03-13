import api from './api';
import {
  upsertChannels, upsertMessages, upsertSongs, upsertGigs, upsertMembers,
  getSyncState, setSyncState,
  getDatabase,
} from './database';
import dbEvents from './dbEventEmitter';
import { processQueue } from './syncQueue';

/**
 * Initial sync: pull all data for a workspace (no `since` param).
 * Called on first app load or when sync state is missing.
 */
export async function initialSync(workspaceId) {
  const db = getDatabase();
  if (!db) return;

  try {
    const data = await api.request(`/sync/${workspaceId}/pull`);

    if (data.channels) await upsertChannels(data.channels, workspaceId);
    if (data.messages) {
      await upsertMessages(data.messages);
      // Emit per-channel events so useLocalMessages hooks re-render
      const channelIds = [...new Set(data.messages.map(m => m.channelId))];
      channelIds.forEach(cid => dbEvents.emit(`messages:${cid}`));
    }
    if (data.songs) await upsertSongs(data.songs, workspaceId);
    if (data.gigs) await upsertGigs(data.gigs, workspaceId);
    if (data.members) await upsertMembers(data.members, workspaceId);

    await setSyncState(workspaceId, data.serverTime, true);

    // Notify workspace-level hooks
    dbEvents.emit(`channels:${workspaceId}`);
    dbEvents.emit(`songs:${workspaceId}`);
    dbEvents.emit(`gigs:${workspaceId}`);
    dbEvents.emit(`members:${workspaceId}`);
  } catch (err) {
    // Initial sync failure is non-fatal — app still works via API
    console.warn('Initial sync failed:', err.message);
  }
}

/**
 * Incremental sync: pull only records updated since last sync.
 * Called on reconnect.
 */
export async function incrementalSync(workspaceId) {
  const db = getDatabase();
  if (!db) return;

  const state = await getSyncState(workspaceId);

  if (!state?.initialSyncDone) {
    return initialSync(workspaceId);
  }

  try {
    const since = state.lastSyncedAt;
    const data = await api.request(`/sync/${workspaceId}/pull?since=${encodeURIComponent(since)}`);

    // Upsert updated records
    if (data.channels) await upsertChannels(data.channels, workspaceId);
    if (data.messages) {
      await upsertMessages(data.messages);
      const channelIds = [...new Set(data.messages.map(m => m.channelId))];
      channelIds.forEach(cid => dbEvents.emit(`messages:${cid}`));
    }
    if (data.songs) await upsertSongs(data.songs, workspaceId);
    if (data.gigs) await upsertGigs(data.gigs, workspaceId);
    if (data.members) await upsertMembers(data.members, workspaceId);

    // Note: hard deletions are handled by socket events (message:deleted, etc.)
    // which write to SQLite via socketSyncHandler

    await setSyncState(workspaceId, data.serverTime, true);

    // Notify workspace-level hooks
    dbEvents.emit(`channels:${workspaceId}`);
    dbEvents.emit(`songs:${workspaceId}`);
    dbEvents.emit(`gigs:${workspaceId}`);
    dbEvents.emit(`members:${workspaceId}`);
  } catch (err) {
    console.warn('Incremental sync failed:', err.message);
  }
}

/**
 * Push pending local changes to server.
 * Called on reconnect after incremental sync.
 */
export async function pushChanges() {
  await processQueue();
}
