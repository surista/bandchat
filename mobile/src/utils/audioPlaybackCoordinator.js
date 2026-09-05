/**
 * App-wide "only one audio player at a time" coordinator. iOS HIG (and
 * common sense) expects one-at-a-time playback when multiple audio
 * attachments/recordings are on screen — starting one should pause any
 * other that's currently playing, regardless of which screen or component
 * it lives in (message bubbles, song attachments, the recordings list, a
 * recording's own detail screen).
 *
 * Originally this lived as a module-private Set inside MessageBubble.js,
 * which meant only message-bubble audio players ever actually coordinated
 * with each other — anything added elsewhere had nothing to register with.
 * Pulled out here so every audio player component can share one registry.
 */
const listeners = new Set();

/** Announce that `playerId` just started playing — every other registered
 * player pauses itself. `playerId` can be any stable per-instance value
 * (e.g. a `useRef({})` object) so a player recognizes and ignores its own
 * broadcast. */
export function broadcastAudioPlay(playerId) {
  for (const fn of listeners) {
    fn(playerId);
  }
}

/** Register a player's pause callback. Returns an unsubscribe function —
 * call it from your effect's cleanup. */
export function subscribeAudioPause(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
