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
 * Date-only fields (e.g. Setlist.performedAt set from a date picker) are sent
 * as "YYYY-MM-DD" and stored as midnight UTC. Formatting them with `new Date(value)` shows the
 * previous day anywhere west of UTC, so rebuild the calendar date from its UTC
 * parts as a local Date instead. Returns null for empty/invalid input.
 * Mirrors mobile/src/utils/formatDate.js.
 */
export function parseDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Setlist.performedAt is NOT always a date-only value: the server also
  // copies a gig's full date+time into it (auto-created gig setlists, gig
  // completion). Only an exact UTC-midnight value is a stored date-only
  // field; anything else is a real instant whose calendar day is the local
  // one (an 8pm Pacific gig is 03:00Z the next day).
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0
    && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  if (!isUtcMidnight) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
