/**
 * Setlist duration calculation.
 *
 * We report two numbers:
 *   - actualSecs:  sum of song/break/MC durations as-is. Accurate to the songs.
 *   - paddedSecs:  actualSecs + Ns between every pair of songs in the setlist,
 *                  where N is the workspace-configured transition padding
 *                  (15s default). The padded total is the realistic gig length
 *                  — bands need a few seconds between songs for tuning, banter,
 *                  and gear changes.
 *
 * The last song of the setlist is NOT padded (no transition to pad *into*).
 * When multiple sets exist, songs inside a set do receive their trailing pad
 * (because there's a transition from last-song-of-set to the break), but the
 * very last song of the very last set does not.
 */

export const DEFAULT_TRANSITION_PADDING_SECS = 15;

/**
 * Fallback length for an MC section with no explicit duration. Applies to new
 * MC items and to any stored item whose duration is null — MC items already
 * saved with an explicit 60 keep it, since that is real data, not a default.
 */
export const MC_DEFAULT_DURATION_SECS = 30;

export function isSongItem(item) {
  return item?.type === 'SONG' || (!item?.type && item?.song);
}

/**
 * Sum actual duration for a setlist item. No rounding, no padding.
 */
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

/**
 * Compute actual and padded totals for a setlist (array of items).
 * Returns { actualSecs, paddedSecs, songCount, paddingSecs }.
 */
export function computeSetlistDuration(items, paddingSecs) {
  const pad = resolvePadding(paddingSecs);
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = Math.max(0, songCount - 1);
  const paddedSecs = actualSecs + padCount * pad;
  return { actualSecs, paddedSecs, songCount, paddingSecs: pad };
}

/**
 * Compute padded duration for a single SET within a multi-set gig.
 * All songs in a non-final set are padded (including the last, because it
 * transitions into the break). In the final set, the very last song is not.
 */
export function computeSetDuration(items, { isFinalSet, paddingSecs }) {
  const pad = resolvePadding(paddingSecs);
  const list = Array.isArray(items) ? items : [];
  const actualSecs = list.reduce((sum, it) => sum + getItemActualDuration(it), 0);
  const songCount = list.filter(isSongItem).length;
  const padCount = isFinalSet ? Math.max(0, songCount - 1) : songCount;
  const paddedSecs = actualSecs + padCount * pad;
  return { actualSecs, paddedSecs, songCount, paddingSecs: pad };
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
