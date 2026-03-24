import { describe, it, expect } from 'vitest';
import { isSafeUrl } from '../urlSafety';

describe('isSafeUrl', () => {
  it('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
  });

  it('accepts URLs with paths', () => {
    expect(isSafeUrl('https://example.com/path/to/resource')).toBe(true);
  });

  it('accepts URLs with query params', () => {
    expect(isSafeUrl('https://example.com?foo=bar&baz=1')).toBe(true);
  });

  it('is case-insensitive for protocol', () => {
    expect(isSafeUrl('HTTPS://example.com')).toBe(true);
    expect(isSafeUrl('Http://example.com')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isSafeUrl('  https://example.com  ')).toBe(true);
  });

  it('rejects javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: protocol', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects vbscript: protocol', () => {
    expect(isSafeUrl('vbscript:msgbox')).toBe(false);
  });

  it('rejects ftp: protocol', () => {
    expect(isSafeUrl('ftp://files.example.com')).toBe(false);
  });

  it('rejects relative paths', () => {
    expect(isSafeUrl('/path/to/file')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isSafeUrl(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSafeUrl(undefined)).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isSafeUrl(123)).toBe(false);
    expect(isSafeUrl({})).toBe(false);
  });
});
