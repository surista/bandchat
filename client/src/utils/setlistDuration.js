/**
 * Setlist duration calculation.
 *
 * We report two numbers:
 *   - actualSecs:  sum of song/break/MC durations as-is. Accurate to the songs.
 *   - paddedSecs:  actualSecs + 15s between every pair of songs in the setlist.
 *                  This is the realistic gig length — bands need a few seconds
 *                  between songs for tuning, banter, and setup.
 *
 * The last song of the setlist is NOT padded (no transition to pad *into*).
 * When multiple sets exist, songs inside a set do receive their trailing pad
 * (because there's a transition from last-song-of-set to the break), but the
 * very last song of the very last set does not.
 */

export const TRANSITION_PADDING_SECS = 15;

export function isSongItem(item) {
  return item?.type === 'SONG' || (!item?.type && item?.song);
}

/**
 * Sum actual duration for a setlist item. No rounding, no padding.
 */
export function getItemActualDuration(item) {
  if (!item) return 0;
  if (item.type === 'SET_BREAK') return item.duration || 0;
  if (item.type === 'MC') return item.duration || 60;
  return item.song?.duration || 0;
}

/**
 * Compute actual and padded totals for a setlist (array of items).
 * Returns { actualSecs, paddedSecs, songCount }.
 */
export function computeSetlistDuration(items) {
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = Math.max(0, songCount - 1);
  const paddedSecs = actualSecs + padCount * TRANSITION_PADDING_SECS;
  return { actualSecs, paddedSecs, songCount };
}

/**
 * Compute padded duration for a single SET within a multi-set gig.
 * All songs in a non-final set are padded (including the last, because it
 * transitions into the break). In the final set, the very last song is not.
 */
export function computeSetDuration(items, { isFinalSet }) {
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = isFinalSet ? Math.max(0, songCount - 1) : songCount;
  const paddedSecs = actualSecs + padCount * TRANSITION_PADDING_SECS;
  return { actualSecs, paddedSecs, songCount };
}

/**
 * Format a seconds value as "M:SS" (or "H:MM:SS" if >= 1 hour).
 */
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
