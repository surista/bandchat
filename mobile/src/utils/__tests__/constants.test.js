const { APP_BASE_URL, TYPE_COLORS, STATUS_COLORS } = require('../constants');

describe('constants', () => {
  test('APP_BASE_URL is the Vercel URL', () => {
    expect(APP_BASE_URL).toBe('https://bandchat.vercel.app');
  });

  test('TYPE_COLORS has all event types', () => {
    expect(TYPE_COLORS).toHaveProperty('GIG');
    expect(TYPE_COLORS).toHaveProperty('REHEARSAL');
    expect(TYPE_COLORS).toHaveProperty('RECORDING');
    expect(TYPE_COLORS).toHaveProperty('OTHER');
  });

  test('TYPE_COLORS values are hex colors', () => {
    for (const color of Object.values(TYPE_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('STATUS_COLORS has all statuses', () => {
    expect(STATUS_COLORS).toHaveProperty('SCHEDULED');
    expect(STATUS_COLORS).toHaveProperty('COMPLETED');
    expect(STATUS_COLORS).toHaveProperty('CANCELLED');
  });

  test('STATUS_COLORS values are hex colors', () => {
    for (const color of Object.values(STATUS_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
