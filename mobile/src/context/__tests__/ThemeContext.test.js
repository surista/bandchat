jest.mock('react-native', () => ({
  useColorScheme: jest.fn(() => 'dark'),
  Appearance: { getColorScheme: jest.fn(() => 'dark') },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  multiGet: jest.fn(() => []),
}));

const { themes } = require('../ThemeContext');

// ───────────────────────────────────────────────────
// Theme Definitions
// ───────────────────────────────────────────────────

describe('Theme definitions', () => {
  const themeIds = Object.keys(themes);

  test('has 12 themes', () => {
    expect(themeIds.length).toBe(12);
  });

  test('includes all expected theme IDs', () => {
    const expected = [
      'default', 'midnight', 'ocean', 'forest', 'sunset',
      'lavender', 'cherry', 'slate', 'coffee', 'arctic', 'ember', 'noir',
    ];
    for (const id of expected) {
      expect(themes[id]).toBeDefined();
    }
  });

  test('each theme has all required color properties', () => {
    const requiredProps = [
      'name', 'sidebar', 'sidebarHover', 'sidebarActive',
      'accent', 'accentHover', 'primary', 'primaryHover',
      'modalBg', 'modalCard', 'modalBorder',
    ];

    for (const [id, theme] of Object.entries(themes)) {
      for (const prop of requiredProps) {
        expect(theme[prop]).toBeDefined();
      }
    }
  });

  test('all color values are valid hex colors', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    const colorProps = [
      'sidebar', 'sidebarHover', 'sidebarActive',
      'accent', 'accentHover', 'primary', 'primaryHover',
      'modalBg', 'modalCard', 'modalBorder',
    ];

    for (const [id, theme] of Object.entries(themes)) {
      for (const prop of colorProps) {
        expect(theme[prop]).toMatch(hexPattern);
      }
    }
  });

  test('theme names are human-readable', () => {
    expect(themes.default.name).toBe('Aubergine');
    expect(themes.midnight.name).toBe('Midnight');
    expect(themes.ocean.name).toBe('Ocean');
    expect(themes.forest.name).toBe('Forest');
    expect(themes.sunset.name).toBe('Sunset');
    expect(themes.lavender.name).toBe('Lavender');
    expect(themes.cherry.name).toBe('Cherry');
    expect(themes.slate.name).toBe('Slate');
    expect(themes.coffee.name).toBe('Coffee');
    expect(themes.arctic.name).toBe('Arctic');
    expect(themes.ember.name).toBe('Ember');
    expect(themes.noir.name).toBe('Noir');
  });

  test('default theme (Aubergine) has correct primary color', () => {
    expect(themes.default.primary).toBe('#2BAC76');
  });

  test('each theme has unique name', () => {
    const names = Object.values(themes).map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('sidebar colors are different from modal colors (visual distinction)', () => {
    for (const [id, theme] of Object.entries(themes)) {
      // Sidebar and modal should be visually distinct
      expect(theme.sidebar).not.toBe(theme.modalBg);
    }
  });
});

// ───────────────────────────────────────────────────
// Theme Parity with Web
// ───────────────────────────────────────────────────

describe('Theme parity with web', () => {
  test('mobile has same number of themes as expected', () => {
    // Web and mobile should have identical theme sets
    expect(Object.keys(themes).length).toBe(12);
  });

  test('default theme matches known values', () => {
    // These values should be identical on web and mobile
    expect(themes.default.sidebar).toBe('#3F0E40');
    expect(themes.default.accent).toBe('#4A154B');
    expect(themes.default.primary).toBe('#2BAC76');
  });

  test('midnight theme matches known values', () => {
    expect(themes.midnight.sidebar).toBe('#1a1d21');
    expect(themes.midnight.primary).toBe('#36C5F0');
  });
});
