import { format } from 'date-fns';

/**
 * Format a date as dd-MMM-yyyy (e.g., "07-Feb-2026").
 * @param {string|Date} date - Date string or Date object
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';
  return format(new Date(date), 'dd-MMM-yyyy');
}

/**
 * Date-only fields (e.g. Setlist.performedAt) are sent as "YYYY-MM-DD" and
 * stored as midnight UTC. Formatting them with `new Date(value)` shows the
 * previous day anywhere west of UTC, so rebuild the calendar date from its UTC
 * parts as a local Date instead. Returns null for empty/invalid input.
 * Mirrors mobile/src/utils/formatDate.js.
 */
export function parseDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Local Date -> "YYYY-MM-DD" for sending a date-only field to the server. */
export function toDateOnlyString(date) {
  return date ? format(date, 'yyyy-MM-dd') : null;
}

/** Format a date-only field without the timezone shift (see parseDateOnly). */
export function formatDateOnly(value, pattern = 'dd-MMM-yyyy') {
  const d = parseDateOnly(value);
  return d ? format(d, pattern) : '';
}
