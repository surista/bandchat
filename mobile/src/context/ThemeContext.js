import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function hexToHSL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function lightTint(hex) {
  const { h, s } = hexToHSL(hex);
  return hslToHex(h, Math.min(s, 30), 96);
}

const structuralColors = {
  dark: {
    bgPrimary: '#111827',
    bgSecondary: '#1f2937',
    bgTertiary: '#374151',
    textPrimary: '#ffffff',
    textSecondary: '#9ca3af',
    border: '#374151',
    badgeKey: '#c084fc',      // purple — key badges
    badgeKeyBg: 'rgba(192,132,252,0.15)',
    badgeBpm: '#60a5fa',      // blue — BPM badges
    badgeBpmBg: 'rgba(96,165,250,0.15)',
    badgeDuration: '#9ca3af', // gray — duration badges
    badgeDurationBg: 'rgba(156,163,175,0.15)',
    badgeSet: '#4ade80',      // green — set labels
    badgeMc: '#facc15',       // amber — MC labels
    badgeVenue: '#fbbf24',    // amber — venue badges
  },
  light: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f3f4f6',
    bgTertiary: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    border: '#d1d5db',
    badgeKey: '#7c3aed',      // darker purple for light bg contrast
    badgeKeyBg: 'rgba(124,58,237,0.1)',
    badgeBpm: '#2563eb',      // darker blue for light bg contrast
    badgeBpmBg: 'rgba(37,99,235,0.1)',
    badgeDuration: '#6b7280', // gray-500
    badgeDurationBg: 'rgba(107,114,128,0.1)',
    badgeSet: '#16a34a',      // darker green for light bg contrast
    badgeMc: '#ca8a04',       // darker amber for light bg contrast
    badgeVenue: '#b45309',    // darker amber for light bg contrast
  },
};

const ThemeContext = createContext(null);

const DENSITY_VALUES = {
  comfortable: {
    containerPaddingTop: 12,
    containerPaddingBottom: 8,
    groupedPaddingTop: 4,
    groupedPaddingBottom: 4,
    avatarSize: 40,
    groupedSpacerWidth: 50,
    contentFontSize: 16,
    contentLineHeight: 24,
    authorFontSize: 16,
  },
  default: {
    containerPaddingTop: 8,
    containerPaddingBottom: 4,
    groupedPaddingTop: 1,
    groupedPaddingBottom: 1,
    avatarSize: 36,
    groupedSpacerWidth: 46,
    contentFontSize: 15,
    contentLineHeight: 21,
    authorFontSize: 15,
  },
  compact: {
    containerPaddingTop: 4,
    containerPaddingBottom: 2,
    groupedPaddingTop: 0,
    groupedPaddingBottom: 0,
    avatarSize: 28,
    groupedSpacerWidth: 38,
    contentFontSize: 14,
    contentLineHeight: 19,
    authorFontSize: 13,
  },
};

export function ThemeProvider({ children }) {
  const systemColorScheme = useColorScheme();
  const [globalTheme, setGlobalTheme] = useState('default');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [workspaceThemes, setWorkspaceThemesState] = useState({});
  const [mode, setMode] = useState(systemColorScheme === 'light' ? 'light' : 'dark');
  const [messageDensity, setMessageDensityState] = useState('default');
  const [loaded, setLoaded] = useState(false);

  // Resolve which theme to actually use
  const currentTheme = (activeWorkspaceId && workspaceThemes[activeWorkspaceId]) || globalTheme;

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('bandchat-theme');
        const savedMode = await AsyncStorage.getItem('bandchat-mode');
        const savedDensity = await AsyncStorage.getItem('bandchat-density');
        const savedWsThemes = await AsyncStorage.getItem('bandchat-workspace-themes');
        if (savedTheme && themes[savedTheme]) setGlobalTheme(savedTheme);
        if (savedMode) {
          setMode(savedMode);
        }
        if (savedDensity && DENSITY_VALUES[savedDensity]) {
          setMessageDensityState(savedDensity);
        }
        if (savedWsThemes) {
          try {
            const parsed = JSON.parse(savedWsThemes);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setWorkspaceThemesState(parsed);
            }
          } catch (e) {
            // Expected: JSON.parse may fail for corrupted workspace themes data
          }
        }
      } catch {
        // Use defaults
      } finally {
        setLoaded(true);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem('bandchat-theme', globalTheme);
      AsyncStorage.setItem('bandchat-mode', mode);
      AsyncStorage.setItem('bandchat-density', messageDensity);
      AsyncStorage.setItem('bandchat-workspace-themes', JSON.stringify(workspaceThemes));
    }
  }, [globalTheme, mode, messageDensity, workspaceThemes, loaded]);

  const setMessageDensity = useCallback((density) => {
    if (DENSITY_VALUES[density]) {
      setMessageDensityState(density);
    }
  }, []);

  const setTheme = useCallback((themeId) => {
    if (!themes[themeId]) return;
    if (activeWorkspaceId && workspaceThemes[activeWorkspaceId]) {
      setWorkspaceThemesState(prev => ({ ...prev, [activeWorkspaceId]: themeId }));
    } else {
      setGlobalTheme(themeId);
    }
  }, [activeWorkspaceId, workspaceThemes]);

  const setWorkspaceTheme = useCallback((workspaceId, themeId) => {
    setWorkspaceThemesState(prev => {
      const updated = { ...prev };
      if (themeId) {
        updated[workspaceId] = themeId;
      } else {
        delete updated[workspaceId];
      }
      return updated;
    });
  }, []);

  const getWorkspaceTheme = useCallback((workspaceId) => {
    return workspaceThemes[workspaceId] || null;
  }, [workspaceThemes]);

  const toggleMode = useCallback(() => {
    setMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const colors = useMemo(() => {
    const theme = themes[currentTheme] || themes.default;
    const structural = structuralColors[mode];
    // Use neutral modal colors for consistent text readability regardless of theme
    const modalColors = mode === 'light'
      ? { modalBg: '#ffffff', modalCard: '#f3f4f6', modalBorder: '#d1d5db' }
      : { modalBg: '#1f1f23', modalCard: '#2a2a30', modalBorder: '#3f3f46' };

    const channelListColors = {
      headerBg: theme.sidebar,
      channelListBg: mode === 'dark' ? theme.accent : lightTint(theme.sidebar),
      channelListText: mode === 'dark' ? 'rgba(255,255,255,0.7)' : structural.textSecondary,
      channelListTextBold: mode === 'dark' ? '#ffffff' : structural.textPrimary,
    };

    // Header text color: white for dark headers, dark for light headers
    const headerText = hexLuminance(theme.sidebar) > 0.4 ? '#111827' : '#ffffff';

    return {
      ...theme,
      ...structural,
      ...modalColors,
      ...channelListColors,
      headerText,
      error: mode === 'dark' ? '#ef4444' : '#dc2626',
      success: mode === 'dark' ? '#22c55e' : '#16a34a',
      warning: mode === 'dark' ? '#eab308' : '#ca8a04',
    };
  }, [currentTheme, mode]);

  const density = useMemo(() => DENSITY_VALUES[messageDensity] || DENSITY_VALUES.default, [messageDensity]);

  const contextValue = useMemo(() => ({
    currentTheme,
    setTheme,
    themes,
    mode,
    toggleMode,
    colors,
    messageDensity,
    setMessageDensity,
    density,
    globalTheme,
    setGlobalTheme: (id) => { if (themes[id]) setGlobalTheme(id); },
    activeWorkspaceId,
    setActiveWorkspaceId,
    setWorkspaceTheme,
    getWorkspaceTheme,
  }), [currentTheme, setTheme, mode, toggleMode, colors, messageDensity, setMessageDensity, density, globalTheme, activeWorkspaceId, setWorkspaceTheme, getWorkspaceTheme]);

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
