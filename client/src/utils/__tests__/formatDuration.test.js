import { describe, it, expect } from 'vitest';
import { formatDuration, formatTotalDuration } from '../formatDuration';

describe('formatDuration', () => {
  it('formats seconds to m:ss', () => {
    expect(formatDuration(185)).toBe('3:05');
  });

  it('handles exact minutes', () => {
    expect(formatDuration(240)).toBe('4:00');
  });

  it('handles under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('handles single digit seconds with padding', () => {
    expect(formatDuration(63)).toBe('1:03');
  });

  it('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatDuration(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('handles large values (10+ minutes)', () => {
    expect(formatDuration(725)).toBe('12:05');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(65.7)).toBe('1:05');
  });
});

describe('formatTotalDuration', () => {
  it('formats minutes only', () => {
    expect(formatTotalDuration(300)).toBe('5m');
  });

  it('formats hours and minutes', () => {
    expect(formatTotalDuration(5400)).toBe('1h 30m');
  });

  it('returns 0m for 0', () => {
    expect(formatTotalDuration(0)).toBe('0m');
  });

  it('returns 0m for null', () => {
    expect(formatTotalDuration(null)).toBe('0m');
  });

  it('returns 0m for undefined', () => {
    expect(formatTotalDuration(undefined)).toBe('0m');
  });

  it('handles exact hours', () => {
    expect(formatTotalDuration(7200)).toBe('2h 0m');
  });

  it('handles large durations', () => {
    expect(formatTotalDuration(12600)).toBe('3h 30m');
  });
});
