const { default: getInitial } = require('../getInitial');

describe('getInitial', () => {
  test('returns uppercase first character', () => {
    expect(getInitial('Alice')).toBe('A');
  });

  test('uppercases lowercase', () => {
    expect(getInitial('bob')).toBe('B');
  });

  test('returns ? for empty string', () => {
    expect(getInitial('')).toBe('?');
  });

  test('returns ? for null', () => {
    expect(getInitial(null)).toBe('?');
  });

  test('returns ? for undefined', () => {
    expect(getInitial(undefined)).toBe('?');
  });

  test('handles single character', () => {
    expect(getInitial('X')).toBe('X');
  });

  test('handles name with spaces', () => {
    expect(getInitial('John Doe')).toBe('J');
  });
});
