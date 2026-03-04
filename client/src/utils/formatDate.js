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
