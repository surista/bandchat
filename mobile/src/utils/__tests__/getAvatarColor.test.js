const { default: getAvatarColor } = require('../getAvatarColor');

describe('getAvatarColor', () => {
  test('returns a hex color string', () => {
    const color = getAvatarColor('Alice');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('returns consistent color for same name', () => {
    const a = getAvatarColor('Bob');
    const b = getAvatarColor('Bob');
    expect(a).toBe(b);
  });

  test('returns different colors for different names', () => {
    const colors = new Set([
      getAvatarColor('Alice'),
      getAvatarColor('Bob'),
      getAvatarColor('Charlie'),
      getAvatarColor('Diana'),
      getAvatarColor('Eve'),
    ]);
    // With 5 names and 10 colors, very likely to get at least 2 different
    expect(colors.size).toBeGreaterThan(1);
  });

  test('handles single character names', () => {
    const color = getAvatarColor('A');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('handles long names', () => {
    const color = getAvatarColor('A Very Long Display Name With Many Words');
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
