/**
 * Setlist duration calculation (mobile mirror of client/src/utils/setlistDuration.js).
 * Keep these two files in sync — they must produce identical numbers so the
 * same setlist shows the same total on web and mobile.
 *
 * Returns two numbers:
 *   - actualSecs: sum of song/break/MC durations as-is.
 *   - paddedSecs: actualSecs + Ns between every pair of songs (realistic gig
 *                 runtime), where N is the workspace-configured transition
 *                 padding (15s default).
 *
 * The last song of the final set is NOT padded. Songs in earlier sets are
 * padded (including the last one, because its trailing transition feeds
 * into the set break).
 */

export const DEFAULT_TRANSITION_PADDING_SECS = 15;

/**
 * Fallback length for an MC section with no explicit duration. Mirrors
 * client/src/utils/setlistDuration.js — keep the two in sync. MC items already
 * saved with an explicit 60 keep it; this only covers new and null-duration items.
 */
export const MC_DEFAULT_DURATION_SECS = 30;

export function isSongItem(item) {
  return item?.type === 'SONG' || (!item?.type && item?.song);
}

export function getItemActualDuration(item) {
  if (!item) return 0;
  if (item.type === 'SET_BREAK') return item.duration || 0;
  if (item.type === 'MC') return item.duration || MC_DEFAULT_DURATION_SECS;
  return item.song?.duration || 0;
}

function resolvePadding(paddingSecs) {
  if (paddingSecs === 0) return 0;
  if (typeof paddingSecs === 'number' && paddingSecs > 0) return paddingSecs;
  return DEFAULT_TRANSITION_PADDING_SECS;
}

export function computeSetlistDuration(items, paddingSecs) {
  const pad = resolvePadding(paddingSecs);
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = Math.max(0, songCount - 1);
  const paddedSecs = actualSecs + padCount * pad;
  return { actualSecs, paddedSecs, songCount, paddingSecs: pad };
}

export function computeSetDuration(items, { isFinalSet, paddingSecs }) {
  const pad = resolvePadding(paddingSecs);
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = isFinalSet ? Math.max(0, songCount - 1) : songCount;
  const paddedSecs = actualSecs + padCount * pad;
  return { actualSecs, paddedSecs, songCount, paddingSecs: pad };
}

export function formatSetlistDuration(totalSecs) {
  const secs = Math.max(0, Math.round(totalSecs || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
