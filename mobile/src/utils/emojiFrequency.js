import { getUiState, setUiState, getRecentEmojis } from '../services/storage';

// Tracks how often the user picks each emoji so every emoji picker can lead
// with their most-used ones. Mirrored on web at client/src/utils/emojiFrequency.js —
// keep the two in sync (same storage key, same shape, same ranking rules).

const KEY = 'emojiFrequency';

// Counts are halved once any single emoji reaches this, so a burst of 👍 early
// on doesn't pin the same row forever — recent habits can still overtake it.
const DECAY_AT = 200;
// Cap the stored map so it can't grow without bound.
const MAX_TRACKED = 60;

// Shown (and used to pad a short list) before the user has picked much.
export const DEFAULT_FREQUENT = ['👍', '❤️', '🔥', '😂', '🎉', '🎸', '🙌', '💯'];

// Last known ranking, so a picker can paint its "frequent" row on the first
// frame instead of flashing an empty row while AsyncStorage resolves.
let rankedCache = null;

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

/**
 * Read the frequency map. On first run there's nothing stored yet, so we seed
 * from the legacy MRU `recentEmojis` list (most-recent gets the highest count)
 * rather than resetting long-time users to the defaults.
 */
async function readMap() {
  const stored = normalize(await getUiState(KEY, null));
  if (stored && Object.keys(stored).length > 0) return stored;

  const recent = await getRecentEmojis();
  if (!Array.isArray(recent) || recent.length === 0) return {};
  const seeded = {};
  recent.forEach((emoji, i) => {
    if (emoji && !seeded[emoji]) seeded[emoji] = { n: recent.length - i, t: 0 };
  });
  return seeded;
}

/** Sort by count, breaking ties with most-recently-used. */
function rank(map) {
  return Object.entries(map)
    .sort((a, b) => (b[1].n - a[1].n) || (b[1].t - a[1].t))
    .map(([emoji]) => emoji);
}

function pad(ranked, limit) {
  if (ranked.length >= limit) return ranked.slice(0, limit);
  const out = ranked.slice();
  const seen = new Set(out);
  for (const emoji of DEFAULT_FREQUENT) {
    if (out.length >= limit) break;
    if (!seen.has(emoji)) {
      seen.add(emoji);
      out.push(emoji);
    }
  }
  return out;
}

/**
 * The user's most-used emojis, newest habits first. Always resolves to `limit`
 * entries: a short history is padded with defaults the user hasn't used yet,
 * so pickers never render a half-empty or jumping row.
 */
export async function getFrequentEmojis(limit = 8) {
  rankedCache = rank(await readMap());
  return pad(rankedCache, limit);
}

/**
 * Synchronous best guess for the initial render — the last loaded ranking, or
 * the defaults before anything has been read. Pair it with `getFrequentEmojis`
 * in an effect so the row starts correct and then settles.
 */
export function peekFrequentEmojis(limit = 8) {
  return pad(rankedCache || [], limit);
}

/**
 * Record one use of `emoji`. Safe to call from any emoji-selection path.
 * Resolves to the updated frequent list so callers can refresh their UI.
 */
export async function trackEmojiUsage(emoji, limit = 8) {
  if (!emoji) return getFrequentEmojis(limit);

  const map = await readMap();
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

  await setUiState(KEY, pruned);
  rankedCache = rank(pruned);
  return pad(rankedCache, limit);
}
