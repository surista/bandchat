/**
 * Simple pub/sub event emitter for SQLite data changes.
 * Hooks subscribe to entity-specific events and re-render when data changes.
 *
 * Events follow the pattern: `entity:scope`
 *   - channels:${workspaceId}
 *   - messages:${channelId}
 *   - songs:${workspaceId}
 *   - gigs:${workspaceId}
 *   - members:${workspaceId}
 */

const listeners = new Map();

const dbEvents = {
  on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => {
      listeners.get(event)?.delete(callback);
    };
  },

  emit(event, data) {
    const cbs = listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(data); } catch (e) {
          console.error('Event listener error:', e);
        }
      }
    }
  },

  off(event, callback) {
    listeners.get(event)?.delete(callback);
  },
};

export default dbEvents;
