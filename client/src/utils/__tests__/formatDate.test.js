import { describe, it, expect } from 'vitest';
import { formatDate } from '../formatDate';

describe('formatDate', () => {
  it('formats ISO date string to dd-MMM-yyyy', () => {
    expect(formatDate('2026-02-07T00:00:00.000Z')).toBe('07-Feb-2026');
  });

  it('formats Date object', () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe('15-Jan-2026');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatDate('')).toBe('');
  });

  it('handles end of year', () => {
    expect(formatDate('2026-12-31')).toBe('31-Dec-2026');
  });

  it('handles leap day', () => {
    expect(formatDate('2028-02-29')).toBe('29-Feb-2028');
  });
});

describe('date-only helpers', async () => {
  const { parseDateOnly, toDateOnlyString, formatDateOnly } = await import('../formatDate');

  it('keeps the calendar day for a UTC-midnight value in any timezone', () => {
    expect(formatDateOnly('2026-11-12T00:00:00.000Z')).toBe('12-Nov-2026');
    expect(formatDateOnly('2026-11-12')).toBe('12-Nov-2026');
  });

  it('round-trips a local date through the wire format', () => {
    const local = new Date(2026, 10, 12, 23, 30);
    expect(toDateOnlyString(local)).toBe('2026-11-12');
    expect(formatDateOnly(toDateOnlyString(local))).toBe('12-Nov-2026');
  });

  it('returns empty values for missing or invalid input', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('not a date')).toBeNull();
    expect(formatDateOnly('')).toBe('');
    expect(toDateOnlyString(null)).toBeNull();
  });
});
