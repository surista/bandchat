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
