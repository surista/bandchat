import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const themes = {
  default: {
    name: 'Aubergine',
    sidebar: '#3F0E40',
    sidebarHover: '#350d36',
    sidebarActive: '#1164A3',
    accent: '#4A154B',
    accentHover: '#611f69',
    primary: '#2BAC76',
    primaryHover: '#239964',
    modalBg: '#1f1f23',
    modalCard: '#2a2a30',
    modalBorder: '#3f3f46',
  },
  midnight: {
    name: 'Midnight',
    sidebar: '#1a1d21',
    sidebarHover: '#27292d',
    sidebarActive: '#1164A3',
    accent: '#1a1d21',
    accentHover: '#27292d',
    primary: '#36C5F0',
    primaryHover: '#2ba8cc',
    modalBg: '#0f1114',
    modalCard: '#1a1d21',
    modalBorder: '#27292d',
  },
  ocean: {
    name: 'Ocean',
    sidebar: '#0d3b66',
    sidebarHover: '#145088',
    sidebarActive: '#36C5F0',
    accent: '#0d3b66',
    accentHover: '#145088',
    primary: '#36C5F0',
    primaryHover: '#2ba8cc',
    modalBg: '#0a2540',
    modalCard: '#0d3b66',
    modalBorder: '#145088',
  },
  forest: {
    name: 'Forest',
    sidebar: '#1B4332',
    sidebarHover: '#2D6A4F',
    sidebarActive: '#40916C',
    accent: '#1B4332',
    accentHover: '#2D6A4F',
    primary: '#52B788',
    primaryHover: '#40916C',
    modalBg: '#14312a',
    modalCard: '#1B4332',
    modalBorder: '#2D6A4F',
  },
  sunset: {
    name: 'Sunset',
    sidebar: '#5C2018',
    sidebarHover: '#7B2D1E',
    sidebarActive: '#E85D04',
    accent: '#5C2018',
    accentHover: '#7B2D1E',
    primary: '#F48C06',
    primaryHover: '#dc7a05',
    modalBg: '#2d1810',
    modalCard: '#3d2018',
    modalBorder: '#5C2018',
  },
  lavender: {
    name: 'Lavender',
    sidebar: '#4A4063',
    sidebarHover: '#5E5377',
    sidebarActive: '#9381FF',
    accent: '#4A4063',
    accentHover: '#5E5377',
    primary: '#9381FF',
    primaryHover: '#7a68e6',
    modalBg: '#2a2540',
    modalCard: '#3a3455',
    modalBorder: '#4A4063',
  },
  cherry: {
    name: 'Cherry',
    sidebar: '#590D22',
    sidebarHover: '#800F2F',
    sidebarActive: '#FF4D6D',
    accent: '#590D22',
    accentHover: '#800F2F',
    primary: '#FF4D6D',
    primaryHover: '#e6445f',
    modalBg: '#2d0a15',
    modalCard: '#3d0d1c',
    modalBorder: '#590D22',
  },
  slate: {
    name: 'Slate',
    sidebar: '#334155',
    sidebarHover: '#475569',
    sidebarActive: '#0EA5E9',
    accent: '#334155',
    accentHover: '#475569',
    primary: '#0EA5E9',
    primaryHover: '#0c8dcc',
    modalBg: '#1e293b',
    modalCard: '#2a3a4d',
    modalBorder: '#334155',
  },
  coffee: {
    name: 'Coffee',
    sidebar: '#3E2723',
    sidebarHover: '#4E342E',
    sidebarActive: '#8D6E63',
    accent: '#3E2723',
    accentHover: '#4E342E',
    primary: '#A1887F',
    primaryHover: '#8D6E63',
    modalBg: '#1f1510',
    modalCard: '#2e1f1a',
    modalBorder: '#3E2723',
  },
  arctic: {
    name: 'Arctic',
    sidebar: '#1E3A5F',
    sidebarHover: '#2E5077',
    sidebarActive: '#4DA8DA',
    accent: '#1E3A5F',
    accentHover: '#2E5077',
    primary: '#4DA8DA',
    primaryHover: '#3d96c4',
    modalBg: '#152a45',
    modalCard: '#1E3A5F',
    modalBorder: '#2E5077',
  },
  ember: {
    name: 'Ember',
    sidebar: '#2D1B0E',
    sidebarHover: '#442915',
    sidebarActive: '#D35400',
    accent: '#2D1B0E',
    accentHover: '#442915',
    primary: '#E67E22',
    primaryHover: '#d35400',
    modalBg: '#1a1008',
    modalCard: '#2D1B0E',
    modalBorder: '#442915',
  },
  noir: {
    name: 'Noir',
    sidebar: '#0D0D0D',
    sidebarHover: '#1A1A1A',
    sidebarActive: '#404040',
    accent: '#0D0D0D',
    accentHover: '#1A1A1A',
    primary: '#e5e5e5',
    primaryHover: '#cccccc',
    modalBg: '#0a0a0a',
    modalCard: '#141414',
    modalBorder: '#262626',
  },
};

const structuralColors = {
  dark: {
    bgPrimary: '#111827',    // gray-900
    bgSecondary: '#1f2937',  // gray-800
    bgTertiary: '#374151',   // gray-700
    textPrimary: '#ffffff',
    textSecondary: '#9ca3af', // gray-400
    border: '#374151',       // gray-700
    badgeKey: '#c084fc',
    badgeBpm: '#60a5fa',
    badgeDuration: '#9ca3af',
  },
  light: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f3f4f6',  // gray-100
    bgTertiary: '#e5e7eb',   // gray-200
    textPrimary: '#111827',  // gray-900
    textSecondary: '#6b7280', // gray-500
    border: '#d1d5db',       // gray-300
    badgeKey: '#7c3aed',
    badgeBpm: '#2563eb',
    badgeDuration: '#6b7280',
  },
};

const ThemeContext = createContext();

function getWorkspaceThemes() {
  try {
    const parsed = JSON.parse(localStorage.getItem('bandchat-workspace-themes') || '{}');
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
}

function saveWorkspaceThemes(map) {
  localStorage.setItem('bandchat-workspace-themes', JSON.stringify(map));
}

export function ThemeProvider({ children }) {
  const [globalTheme, setGlobalTheme] = useState(() => {
    return localStorage.getItem('bandchat-theme') || 'default';
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [workspaceThemes, setWorkspaceThemes] = useState(getWorkspaceThemes);
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('bandchat-mode');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [isFollowingSystem, setIsFollowingSystem] = useState(() => !localStorage.getItem('bandchat-mode'));

  // Resolve which theme to actually use
  const currentTheme = (activeWorkspaceId && workspaceThemes[activeWorkspaceId]) || globalTheme;

  useEffect(() => {
    const theme = themes[currentTheme] || themes.default;
    const colors = structuralColors[mode];
    const root = document.documentElement;

    root.style.setProperty('--color-sidebar', theme.sidebar);
    root.style.setProperty('--color-sidebar-hover', theme.sidebarHover);
    root.style.setProperty('--color-sidebar-active', theme.sidebarActive);
    root.style.setProperty('--color-accent', theme.accent);
    root.style.setProperty('--color-accent-hover', theme.accentHover);
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-hover', theme.primaryHover);
    // Use neutral modal colors for consistent readability regardless of theme
    // Theme colors only affect sidebar/accent - modals stay neutral for text contrast
    if (mode === 'light') {
      root.style.setProperty('--color-modal-bg', '#ffffff');
      root.style.setProperty('--color-modal-card', '#f3f4f6');
      root.style.setProperty('--color-modal-border', '#d1d5db');
    } else {
      // Dark mode: use neutral dark grays instead of theme colors
      root.style.setProperty('--color-modal-bg', '#1f1f23');
      root.style.setProperty('--color-modal-card', '#2a2a30');
      root.style.setProperty('--color-modal-border', '#3f3f46');
    }

    // Structural colors for dark/light mode
    root.style.setProperty('--color-bg-primary', colors.bgPrimary);
    root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
    root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
    root.style.setProperty('--color-text-primary', colors.textPrimary);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-badge-key', colors.badgeKey);
    root.style.setProperty('--color-badge-bpm', colors.badgeBpm);
    root.style.setProperty('--color-badge-duration', colors.badgeDuration);

    // Set data attribute for CSS selectors
    root.dataset.mode = mode;

    localStorage.setItem('bandchat-theme', globalTheme);
    if (!isFollowingSystem) {
      localStorage.setItem('bandchat-mode', mode);
    }
  }, [currentTheme, mode, globalTheme, isFollowingSystem]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e) => {
      if (!localStorage.getItem('bandchat-mode')) {
        setMode(e.matches ? 'light' : 'dark');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setTheme = useCallback((themeId) => {
    if (!themes[themeId]) return;
    if (activeWorkspaceId && workspaceThemes[activeWorkspaceId]) {
      setWorkspaceThemes(prev => {
        const updated = { ...prev, [activeWorkspaceId]: themeId };
        saveWorkspaceThemes(updated);
        return updated;
      });
    } else {
      setGlobalTheme(themeId);
    }
  }, [activeWorkspaceId, workspaceThemes]);

  const setWorkspaceTheme = useCallback((workspaceId, themeId) => {
    setWorkspaceThemes(prev => {
      const updated = { ...prev };
      if (themeId) {
        updated[workspaceId] = themeId;
      } else {
        delete updated[workspaceId];
      }
      saveWorkspaceThemes(updated);
      return updated;
    });
  }, []);

  const getWorkspaceTheme = useCallback((workspaceId) => {
    return workspaceThemes[workspaceId] || null;
  }, [workspaceThemes]);

  const toggleMode = () => {
    setMode(prev => prev === 'dark' ? 'light' : 'dark');
    setIsFollowingSystem(false);
  };

  const followSystem = () => {
    localStorage.removeItem('bandchat-mode');
    const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    setMode(isLight ? 'light' : 'dark');
    setIsFollowingSystem(true);
  };

  const contextValue = useMemo(() => ({
    currentTheme, setTheme, themes, mode, toggleMode, followSystem,
    isFollowingSystem,
    globalTheme,
    setGlobalTheme: (themeId) => { if (themes[themeId]) setGlobalTheme(themeId); },
    activeWorkspaceId, setActiveWorkspaceId,
    setWorkspaceTheme, getWorkspaceTheme,
  }), [currentTheme, globalTheme, mode, isFollowingSystem, activeWorkspaceId, setTheme, setWorkspaceTheme, getWorkspaceTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { themes };
