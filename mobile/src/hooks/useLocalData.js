import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLocalChannels, upsertChannels,
  getLocalMessages, upsertMessages,
  getLocalSongs, upsertSongs,
  getLocalGigs, upsertGigs,
  getLocalMembers, upsertMembers,
  getDatabase,
} from '../services/database';
import dbEvents from '../services/dbEventEmitter';
import api from '../services/api';

/**
 * Read channels from SQLite (instant), then refresh from API in background.
 */
export function useLocalChannels(workspaceId) {
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFromDb = useCallback(async () => {
    if (!workspaceId || !getDatabase()) return;
    const all = await getLocalChannels(workspaceId);
    setChannels(all.filter(c => !c.isDirect && !c.isDM));
    setDirectMessages(all.filter(c => c.isDirect || c.isDM));
    setLoading(false);
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [chans, dms] = await Promise.all([
        api.getChannels(workspaceId),
        api.getDMs(workspaceId),
      ]);
      const all = [...chans, ...dms];
      await upsertChannels(all, workspaceId);
      setChannels(chans);
      setDirectMessages(dms);
      dbEvents.emit(`channels:${workspaceId}`);
    } catch (e) {
      console.error('Failed to refresh channels from API:', e);
    }
  }, [workspaceId]);

  // Load from DB first (instant), then refresh from API
  useEffect(() => {
    loadFromDb().then(() => refresh());
  }, [loadFromDb, refresh]);

  // Subscribe to DB changes
  useEffect(() => {
    if (!workspaceId) return;
    return dbEvents.on(`channels:${workspaceId}`, loadFromDb);
  }, [workspaceId, loadFromDb]);

  return { channels, directMessages, loading, refresh };
}

/**
 * Read messages from SQLite (instant), then refresh from API in background.
 */
export function useLocalMessages(channelId, limit = 50) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const loadingMoreRef = useRef(false);

  const loadFromDb = useCallback(async () => {
    if (!channelId || !getDatabase()) return;
    const msgs = await getLocalMessages(channelId, limit);
    // No length guard — a legitimately-empty local table (e.g. after the
    // last message was deleted via a socket event + upsertMessages) needs to
    // actually clear the UI, not keep showing stale/deleted messages until
    // the next full API refresh happens to overwrite it.
    setMessages(msgs);
    setLoading(false);
  }, [channelId, limit]);

  const refresh = useCallback(async () => {
    if (!channelId) return;
    try {
      const data = await api.getMessages(channelId);
      await upsertMessages(data.messages);
      setMessages(data.messages);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setLoading(false);
      dbEvents.emit(`messages:${channelId}`);
    } catch {
      setLoading(false);
    }
  }, [channelId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    try {
      const data = await api.getMessages(channelId, nextCursor);
      await upsertMessages(data.messages);
      setMessages(prev => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (e) {
      console.error('Failed to load more messages:', e);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, nextCursor, channelId]);

  // Load from DB first, then refresh
  useEffect(() => {
    loadFromDb().then(() => refresh());
  }, [loadFromDb, refresh]);

  // Subscribe to DB changes
  useEffect(() => {
    if (!channelId) return;
    return dbEvents.on(`messages:${channelId}`, loadFromDb);
  }, [channelId, loadFromDb]);

  return { messages, setMessages, loading, hasMore, loadMore, refresh };
}

/**
 * Read songs from SQLite (instant), then refresh from API in background.
 */
export function useLocalSongs(workspaceId) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFromDb = useCallback(async () => {
    if (!workspaceId || !getDatabase()) return;
    const data = await getLocalSongs(workspaceId);
    setSongs(data);
    setLoading(false);
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await api.getSongs(workspaceId);
      await upsertSongs(data, workspaceId);
      setSongs(data);
      setLoading(false);
      dbEvents.emit(`songs:${workspaceId}`);
    } catch {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadFromDb().then(() => refresh());
  }, [loadFromDb, refresh]);

  useEffect(() => {
    if (!workspaceId) return;
    return dbEvents.on(`songs:${workspaceId}`, loadFromDb);
  }, [workspaceId, loadFromDb]);

  return { songs, setSongs, loading, refresh };
}

/**
 * Read gigs from SQLite (instant), then refresh from API in background.
 */
export function useLocalGigs(workspaceId) {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFromDb = useCallback(async () => {
    if (!workspaceId || !getDatabase()) return;
    const data = await getLocalGigs(workspaceId);
    setGigs(data);
    setLoading(false);
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await api.getGigs(workspaceId);
      await upsertGigs(data, workspaceId);
      setGigs(data);
      setLoading(false);
      dbEvents.emit(`gigs:${workspaceId}`);
    } catch {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadFromDb().then(() => refresh());
  }, [loadFromDb, refresh]);

  useEffect(() => {
    if (!workspaceId) return;
    return dbEvents.on(`gigs:${workspaceId}`, loadFromDb);
  }, [workspaceId, loadFromDb]);

  return { gigs, setGigs, loading, refresh };
}

/**
 * Read members from SQLite (instant), then refresh from API in background.
 */
export function useLocalMembers(workspaceId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFromDb = useCallback(async () => {
    if (!workspaceId || !getDatabase()) return;
    const data = await getLocalMembers(workspaceId);
    setMembers(data);
    setLoading(false);
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const ws = await api.getWorkspace(workspaceId);
      if (ws.members) {
        await upsertMembers(ws.members, workspaceId);
        setMembers(ws.members);
        dbEvents.emit(`members:${workspaceId}`);
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadFromDb().then(() => refresh());
  }, [loadFromDb, refresh]);

  useEffect(() => {
    if (!workspaceId) return;
    return dbEvents.on(`members:${workspaceId}`, loadFromDb);
  }, [workspaceId, loadFromDb]);

  return { members, loading, refresh };
}
