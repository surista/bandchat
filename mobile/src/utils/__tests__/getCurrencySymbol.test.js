const { default: getCurrencySymbol, CURRENCIES } = require('../getCurrencySymbol');

describe('CURRENCIES', () => {
  test('is an array', () => {
    expect(Array.isArray(CURRENCIES)).toBe(true);
    expect(CURRENCIES.length).toBeGreaterThan(0);
  });

  test('each has code and symbol', () => {
    for (const c of CURRENCIES) {
      expect(c).toHaveProperty('code');
      expect(c).toHaveProperty('symbol');
    }
  });

  test('includes major currencies', () => {
    const codes = CURRENCIES.map(c => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
  });
});

describe('getCurrencySymbol', () => {
  test('returns $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  test('returns € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  test('returns £ for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  test('returns $ for unknown code', () => {
    expect(getCurrencySymbol('XYZ')).toBe('$');
  });

  test('returns $ for undefined', () => {
    expect(getCurrencySymbol(undefined)).toBe('$');
  });
});
