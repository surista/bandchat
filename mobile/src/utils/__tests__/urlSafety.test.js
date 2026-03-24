const { isSafeUrl } = require('../urlSafety');

describe('isSafeUrl', () => {
  test('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  test('accepts https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isSafeUrl('HTTPS://example.com')).toBe(true);
  });

  test('trims whitespace', () => {
    expect(isSafeUrl('  https://example.com  ')).toBe(true);
  });

  test('rejects javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  test('rejects data: protocol', () => {
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
  });

  test('rejects relative paths', () => {
    expect(isSafeUrl('/path/to/file')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  test('rejects null', () => {
    expect(isSafeUrl(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(isSafeUrl(undefined)).toBe(false);
  });

  test('rejects non-string', () => {
    expect(isSafeUrl(123)).toBe(false);
  });
});
