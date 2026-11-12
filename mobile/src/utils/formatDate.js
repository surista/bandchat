import { format } from 'date-fns';

export default function formatDate(dateString) {
  if (!dateString) return '';
  return format(new Date(dateString), 'dd-MMM-yyyy');
}

/**
 * Date-only fields (e.g. Setlist.performedAt) are sent as "YYYY-MM-DD" and
 * stored as midnight UTC. Formatting them with `new Date(value)` shows the
 * previous day anywhere west of UTC, so rebuild the calendar date from its UTC
 * parts as a local Date instead. Returns null for empty/invalid input.
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
