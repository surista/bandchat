import { storage } from '../services/storage';

// Tracks how often the user picks each emoji so every emoji picker can lead
// with their most-used ones. Mirrored on mobile at mobile/src/utils/emojiFrequency.js —
// keep the two in sync (same storage key, same shape, same ranking rules).

const KEY = 'emojiFrequency';

// Counts are halved once any single emoji reaches this, so a burst of 👍 early
// on doesn't pin the same row forever — recent habits can still overtake it.
const DECAY_AT = 200;
// Cap the stored map so it can't grow without bound.
const MAX_TRACKED = 60;

// Shown (and used to pad a short list) before the user has picked much.
export const DEFAULT_FREQUENT = ['👍', '❤️', '🔥', '😂', '🎉', '🎸', '🙌', '💯'];

/**
 * Read the raw map, migrating the legacy `{ emoji: count }` shape to
 * `{ emoji: { n, t } }` in memory. Always returns an object.
 */
function readMap() {
  const raw = storage.getJSON(KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [emoji, value] of Object.entries(raw)) {
    if (typeof value === 'number') {
      if (value > 0) out[emoji] = { n: value, t: 0 };
    } else if (value && typeof value.n === 'number' && value.n > 0) {
      out[emoji] = { n: value.n, t: typeof value.t === 'number' ? value.t : 0 };
    }
  }
  return out;
}

/** Sort by count, breaking ties with most-recently-used. */
function rank(map) {
  return Object.entries(map)
    .sort((a, b) => (b[1].n - a[1].n) || (b[1].t - a[1].t))
    .map(([emoji]) => emoji);
}

/**
 * The user's most-used emojis, newest habits first. Always returns `limit`
 * entries: a short history is padded with defaults the user hasn't used yet,
 * so pickers never render a half-empty or jumping row.
 */
export function getFrequentEmojis(limit = 8) {
  const ranked = rank(readMap()).slice(0, limit);
  if (ranked.length >= limit) return ranked;
  const seen = new Set(ranked);
  for (const emoji of DEFAULT_FREQUENT) {
    if (ranked.length >= limit) break;
    if (!seen.has(emoji)) {
      seen.add(emoji);
      ranked.push(emoji);
    }
  }
  return ranked;
}

/** Record one use of `emoji`. Safe to call from any emoji-selection path. */
export function trackEmojiUsage(emoji) {
  if (!emoji) return;
  const map = readMap();
  const entry = map[emoji] || { n: 0, t: 0 };
  map[emoji] = { n: entry.n + 1, t: Date.now() };

  if (map[emoji].n >= DECAY_AT) {
    for (const key of Object.keys(map)) {
      const n = Math.floor(map[key].n / 2);
      if (n > 0) map[key].n = n;
      else delete map[key];
    }
  }

  let pruned = map;
  if (Object.keys(map).length > MAX_TRACKED) {
    // Keep the just-used emoji even though a first use ranks last — otherwise,
    // once the map is full, a new emoji is evicted on every use and can never
    // climb into the list.
    const kept = rank(map).filter(key => key !== emoji).slice(0, MAX_TRACKED - 1);
    kept.push(emoji);
    pruned = {};
    for (const key of kept) pruned[key] = map[key];
  }

  storage.setJSON(KEY, pruned);
}
