const { formatDuration, formatTotalDuration } = require('../formatDuration');

describe('formatDuration', () => {
  test('formats seconds to m:ss', () => {
    expect(formatDuration(185)).toBe('3:05');
  });

  test('handles exact minutes', () => {
    expect(formatDuration(240)).toBe('4:00');
  });

  test('handles under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  test('pads single digit seconds', () => {
    expect(formatDuration(63)).toBe('1:03');
  });

  test('returns null for 0', () => {
    expect(formatDuration(0)).toBeNull();
  });

  test('returns null for null', () => {
    expect(formatDuration(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  test('handles large values', () => {
    expect(formatDuration(725)).toBe('12:05');
  });

  test('floors fractional seconds', () => {
    expect(formatDuration(65.7)).toBe('1:05');
  });
});

describe('formatTotalDuration', () => {
  test('formats minutes only', () => {
    expect(formatTotalDuration(300)).toBe('5m');
  });

  test('formats hours and minutes', () => {
    expect(formatTotalDuration(5400)).toBe('1h 30m');
  });

  test('returns 0m for 0', () => {
    expect(formatTotalDuration(0)).toBe('0m');
  });

  test('returns 0m for null', () => {
    expect(formatTotalDuration(null)).toBe('0m');
  });

  test('handles exact hours', () => {
    expect(formatTotalDuration(7200)).toBe('2h 0m');
  });
});
