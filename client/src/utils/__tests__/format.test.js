import { describe, it, expect } from 'vitest';
import { formatFileSize } from '../format';

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });

  it('formats zero', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats boundary at 1024 (exactly 1KB)', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats boundary at 1MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats fractional KB', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats fractional MB', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
