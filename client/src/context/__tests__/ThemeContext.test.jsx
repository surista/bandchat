import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, val) => { store[key] = val; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock matchMedia
const matchMediaMock = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
vi.stubGlobal('matchMedia', matchMediaMock);

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach(k => delete store[k]);
});

function renderThemeHook() {
  return renderHook(() => useTheme(), { wrapper: ThemeProvider });
}

// ───────────────────────────────────────────────────
// Theme Provider Basics
// ───────────────────────────────────────────────────

describe('ThemeProvider', () => {
  it('provides theme context', () => {
    const { result } = renderThemeHook();
    expect(result.current).toBeDefined();
    expect(result.current.currentTheme).toBeDefined();
  });

  it('defaults to "default" (Aubergine) theme', () => {
    const { result } = renderThemeHook();
    expect(result.current.currentTheme).toBe('default');
    expect(result.current.globalTheme).toBe('default');
  });

  it('defaults to dark mode when system prefers dark', () => {
    matchMediaMock.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { result } = renderThemeHook();
    expect(result.current.mode).toBe('dark');
  });

  it('defaults to light mode when system prefers light', () => {
    matchMediaMock.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { result } = renderThemeHook();
    expect(result.current.mode).toBe('light');
  });

  it('restores theme from localStorage', () => {
    store['bandchat-theme'] = 'ocean';
    const { result } = renderThemeHook();
    expect(result.current.globalTheme).toBe('ocean');
  });

  it('restores mode from localStorage', () => {
    store['bandchat-mode'] = 'light';
    const { result } = renderThemeHook();
    expect(result.current.mode).toBe('light');
  });

  it('exposes themes object', () => {
    const { result } = renderThemeHook();
    expect(result.current.themes).toBeDefined();
    expect(result.current.themes.default.name).toBe('Aubergine');
    expect(result.current.themes.midnight.name).toBe('Midnight');
    expect(result.current.themes.ocean.name).toBe('Ocean');
  });
});

// ───────────────────────────────────────────────────
// Theme Switching
// ───────────────────────────────────────────────────

describe('Theme switching', () => {
  it('setTheme changes the current theme', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setTheme('midnight');
    });

    expect(result.current.currentTheme).toBe('midnight');
  });

  it('setGlobalTheme updates global theme', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setGlobalTheme('forest');
    });

    expect(result.current.globalTheme).toBe('forest');
  });

  it('persists theme to localStorage', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setTheme('cherry');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith('bandchat-theme', 'cherry');
  });

  it('ignores invalid theme IDs', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setTheme('nonexistent');
    });

    expect(result.current.currentTheme).toBe('default');
  });

  it('sets CSS custom properties on theme change', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setTheme('ocean');
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-sidebar')).toBe('#0d3b66');
    expect(root.style.getPropertyValue('--color-primary')).toBe('#36C5F0');
  });
});

// ───────────────────────────────────────────────────
// Dark/Light Mode
// ───────────────────────────────────────────────────

describe('Dark/Light mode', () => {
  it('toggleMode switches between dark and light', () => {
    store['bandchat-mode'] = 'dark';
    const { result } = renderThemeHook();

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe('light');

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe('dark');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.toggleMode();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith('bandchat-mode', expect.any(String));
  });

  it('sets data-mode attribute on document', () => {
    store['bandchat-mode'] = 'dark';
    renderThemeHook();
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('applies dark structural colors', () => {
    store['bandchat-mode'] = 'dark';
    renderThemeHook();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-bg-primary')).toBe('#111827');
    expect(root.style.getPropertyValue('--color-text-primary')).toBe('#ffffff');
  });

  it('applies light structural colors', () => {
    store['bandchat-mode'] = 'light';
    renderThemeHook();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-bg-primary')).toBe('#ffffff');
    expect(root.style.getPropertyValue('--color-text-primary')).toBe('#111827');
  });
});

// ───────────────────────────────────────────────────
// Workspace Theme Override
// ───────────────────────────────────────────────────

describe('Workspace themes', () => {
  it('workspace theme overrides global theme', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setActiveWorkspaceId('ws-1');
      result.current.setWorkspaceTheme('ws-1', 'ember');
    });

    expect(result.current.currentTheme).toBe('ember');
    expect(result.current.globalTheme).toBe('default'); // Global unchanged
  });

  it('falls back to global when workspace has no override', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setGlobalTheme('forest');
      result.current.setActiveWorkspaceId('ws-2');
    });

    expect(result.current.currentTheme).toBe('forest');
  });

  it('getWorkspaceTheme returns null when no override set', () => {
    const { result } = renderThemeHook();
    expect(result.current.getWorkspaceTheme('ws-99')).toBeNull();
  });

  it('getWorkspaceTheme returns theme ID when override set', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setWorkspaceTheme('ws-1', 'noir');
    });

    expect(result.current.getWorkspaceTheme('ws-1')).toBe('noir');
  });

  it('persists workspace themes to localStorage', () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.setWorkspaceTheme('ws-1', 'cherry');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'bandchat-workspace-themes',
      expect.stringContaining('ws-1')
    );
  });

  it('restores workspace themes from localStorage', () => {
    store['bandchat-workspace-themes'] = JSON.stringify({ 'ws-1': 'arctic' });
    const { result } = renderThemeHook();

    act(() => {
      result.current.setActiveWorkspaceId('ws-1');
    });

    expect(result.current.currentTheme).toBe('arctic');
  });
});

// ───────────────────────────────────────────────────
// System Theme Following
// ───────────────────────────────────────────────────

describe('System theme sync', () => {
  it('isFollowingSystem is true when no saved mode', () => {
    // No bandchat-mode in localStorage
    const { result } = renderThemeHook();
    expect(result.current.isFollowingSystem).toBe(true);
  });

  it('isFollowingSystem is false when mode is saved', () => {
    store['bandchat-mode'] = 'dark';
    const { result } = renderThemeHook();
    expect(result.current.isFollowingSystem).toBe(false);
  });
});

// ───────────────────────────────────────────────────
// useTheme without provider
// ───────────────────────────────────────────────────

describe('useTheme without provider', () => {
  it('throws error outside provider', () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within a ThemeProvider');
  });
});
