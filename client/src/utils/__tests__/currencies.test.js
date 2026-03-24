import { describe, it, expect } from 'vitest';
import { CURRENCIES, getCurrencySymbol } from '../currencies';

describe('CURRENCIES', () => {
  it('is an array of currency objects', () => {
    expect(Array.isArray(CURRENCIES)).toBe(true);
    expect(CURRENCIES.length).toBeGreaterThan(0);
  });

  it('each currency has code, symbol, and name', () => {
    for (const c of CURRENCIES) {
      expect(c).toHaveProperty('code');
      expect(c).toHaveProperty('symbol');
      expect(c).toHaveProperty('name');
    }
  });

  it('includes major currencies', () => {
    const codes = CURRENCIES.map(c => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
    expect(codes).toContain('JPY');
  });
});

describe('getCurrencySymbol', () => {
  it('returns $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('returns € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('returns £ for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('returns ¥ for JPY', () => {
    expect(getCurrencySymbol('JPY')).toBe('¥');
  });

  it('returns A$ for AUD', () => {
    expect(getCurrencySymbol('AUD')).toBe('A$');
  });

  it('defaults to $ for null', () => {
    expect(getCurrencySymbol(null)).toBe('$');
  });

  it('defaults to $ for undefined', () => {
    expect(getCurrencySymbol(undefined)).toBe('$');
  });

  it('defaults to $ for unknown currency code', () => {
    expect(getCurrencySymbol('XYZ')).toBe('$');
  });
});
