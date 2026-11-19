const { default: formatDate } = require('../formatDate');

describe('formatDate', () => {
  test('formats ISO date string to dd-MMM-yyyy', () => {
    expect(formatDate('2026-02-07T00:00:00.000Z')).toBe('07-Feb-2026');
  });

  test('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(formatDate('')).toBe('');
  });

  test('handles end of year', () => {
    expect(formatDate('2026-12-31')).toBe('31-Dec-2026');
  });

  test('handles leap day', () => {
    expect(formatDate('2028-02-29')).toBe('29-Feb-2028');
  });
});

describe('date-only helpers', () => {
  const { parseDateOnly, toDateOnlyString, formatDateOnly } = require('../formatDate');

  test('keeps the calendar day for a UTC-midnight value in any timezone', () => {
    expect(formatDateOnly('2026-11-12T00:00:00.000Z')).toBe('12-Nov-2026');
    expect(formatDateOnly('2026-11-12')).toBe('12-Nov-2026');
  });

  test('round-trips a local date through the wire format', () => {
    const local = new Date(2026, 10, 12, 23, 30);
    expect(toDateOnlyString(local)).toBe('2026-11-12');
    expect(formatDateOnly(toDateOnlyString(local))).toBe('12-Nov-2026');
  });

  test('uses the local calendar day for a full gig date-time (not UTC midnight)', () => {
    // A gig instant: whatever the test machine's timezone, the result must be
    // the local day of that instant, never its UTC day.
    const instant = new Date(2026, 10, 12, 20, 0); // 8pm local
    expect(formatDateOnly(instant.toISOString())).toBe('12-Nov-2026');
    const localMidnight = new Date(2026, 10, 12, 0, 0);
    if (localMidnight.getTimezoneOffset() !== 0) {
      expect(formatDateOnly(localMidnight.toISOString())).toBe('12-Nov-2026');
    }
  });

  test('returns empty values for missing or invalid input', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('not a date')).toBeNull();
    expect(formatDateOnly('')).toBe('');
    expect(toDateOnlyString(null)).toBeNull();
  });
});
