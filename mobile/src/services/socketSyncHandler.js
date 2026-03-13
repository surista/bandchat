import {
  upsertMessage, deleteLocalMessage, updateLocalMessage,
  upsertSong, deleteLocalSong,
  upsertGig, deleteLocalGig,
  upsertChannel, deleteLocalChannel,
  upsertMember,
  getDatabase,
} from './database';
import dbEvents from './dbEventEmitter';

let registeredSocket = null;
const handlers = {};

/**
 * Register socket event listeners that write to SQLite.
 * Call this once when the socket connects and DB is ready.
 */
export function register(socket) {
  if (!socket || !getDatabase()) return;
  // Avoid double-registering
  if (registeredSocket === socket) return;
  unregister(registeredSocket);
  registeredSocket = socket;

  // --- Messages ---
  handlers['message:new'] = async (message) => {
    if (message.parentId) return; // Skip thread replies
    await upsertMessage(message);
    dbEvents.emit(`messages:${message.channelId}`);
  };

  handlers['message:updated'] = async (message) => {
    await updateLocalMessage(message.id, message);
    dbEvents.emit(`messages:${message.channelId}`);
  };

  handlers['message:deleted'] = async ({ messageId, channelId }) => {
    await deleteLocalMessage(messageId);
    dbEvents.emit(`messages:${channelId}`);
  };

  // --- Reactions ---
  handlers['reaction:added'] = async ({ messageId, reaction, channelId }) => {
    const db = getDatabase();
    if (!db) return;
    const row = await db.getFirstAsync('SELECT data FROM messages WHERE id = ?', [messageId]);
    if (!row) return;
    const msg = JSON.parse(row.data);
    msg.reactions = [...(msg.reactions || []), reaction];
    await updateLocalMessage(messageId, msg);
    dbEvents.emit(`messages:${channelId}`);
  };

  handlers['reaction:removed'] = async ({ messageId, emoji, userId, channelId }) => {
    const db = getDatabase();
    if (!db) return;
    const row = await db.getFirstAsync('SELECT data FROM messages WHERE id = ?', [messageId]);
    if (!row) return;
    const msg = JSON.parse(row.data);
    msg.reactions = (msg.reactions || []).filter(
      r => !(r.emoji === emoji && r.userId === userId)
    );
    await updateLocalMessage(messageId, msg);
    dbEvents.emit(`messages:${channelId}`);
  };

  // --- Songs ---
  handlers['song:created'] = async (song) => {
    await upsertSong(song, song.workspaceId);
    dbEvents.emit(`songs:${song.workspaceId}`);
  };

  handlers['song:updated'] = async (song) => {
    await upsertSong(song, song.workspaceId);
    dbEvents.emit(`songs:${song.workspaceId}`);
  };

  handlers['song:deleted'] = async ({ songId, workspaceId: wid }) => {
    await deleteLocalSong(songId);
    if (wid) dbEvents.emit(`songs:${wid}`);
  };

  // --- Gigs ---
  handlers['gig:created'] = async (gig) => {
    await upsertGig(gig, gig.workspaceId);
    dbEvents.emit(`gigs:${gig.workspaceId}`);
  };

  handlers['gig:updated'] = async (gig) => {
    await upsertGig(gig, gig.workspaceId);
    dbEvents.emit(`gigs:${gig.workspaceId}`);
  };

  handlers['gig:deleted'] = async ({ gigId, workspaceId: wid }) => {
    await deleteLocalGig(gigId);
    if (wid) dbEvents.emit(`gigs:${wid}`);
  };

  // --- Channels ---
  handlers['channel:created'] = async (channel) => {
    await upsertChannel(channel, channel.workspaceId);
    dbEvents.emit(`channels:${channel.workspaceId}`);
  };

  handlers['channel:updated'] = async (channel) => {
    await upsertChannel(channel, channel.workspaceId);
    dbEvents.emit(`channels:${channel.workspaceId}`);
  };

  handlers['channel:deleted'] = async ({ channelId, workspaceId: wid }) => {
    await deleteLocalChannel(channelId);
    if (wid) dbEvents.emit(`channels:${wid}`);
  };

  // --- Members ---
  handlers['member:joined'] = async (member) => {
    if (member.workspaceId) {
      await upsertMember(member, member.workspaceId);
      dbEvents.emit(`members:${member.workspaceId}`);
    }
  };

  // Attach all handlers
  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, handler);
  }
}

/**
 * Unregister all socket → SQLite listeners.
 */
export function unregister(socket) {
  if (!socket) return;
  for (const [event, handler] of Object.entries(handlers)) {
    socket.off(event, handler);
  }
  registeredSocket = null;
}
