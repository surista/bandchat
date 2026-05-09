// For song durations (m:ss format). Returns null for falsy input so callers
// can use `??` / `||` to provide a placeholder; previously returned '' which
// the tests assert against null and which can render as an empty cell that
// looks like a layout bug. All callers already guard with `?:` or `||`.
export function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// For total setlist/gig durations (hours + minutes)
export function formatTotalDuration(totalSeconds) {
  if (!totalSeconds) return '0m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
