import { describe, it, expect } from 'vitest';
import getInitial from '../getInitial';

describe('getInitial', () => {
  it('returns uppercase first character', () => {
    expect(getInitial('Alice')).toBe('A');
  });

  it('uppercases lowercase first character', () => {
    expect(getInitial('bob')).toBe('B');
  });

  it('returns ? for empty string', () => {
    expect(getInitial('')).toBe('?');
  });

  it('returns ? for null', () => {
    expect(getInitial(null)).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(getInitial(undefined)).toBe('?');
  });

  it('handles single character', () => {
    expect(getInitial('X')).toBe('X');
  });

  it('handles name with spaces', () => {
    expect(getInitial('John Doe')).toBe('J');
  });

  it('handles emoji as first character', () => {
    const result = getInitial('🎸 Guitar');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles numbers', () => {
    expect(getInitial('123')).toBe('1');
  });
});
