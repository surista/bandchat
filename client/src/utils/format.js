/**
 * Shared formatting utilities.
 */

/**
 * Format a byte count into a human-readable file size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Format a timestamp relative to now: "just now", "5m ago", a time-of-day
 * for today, a weekday for the past week, or a full date beyond that.
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatRelativeDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
