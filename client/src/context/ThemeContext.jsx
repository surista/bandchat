import { createContext, useContext, useState, useEffect } from 'react';

const themes = {
  default: {
    name: 'Aubergine',
    sidebar: '#3F0E40',
    sidebarHover: '#350d36',
    sidebarActive: '#1164A3',
    accent: '#4A154B',
    accentHover: '#611f69',
    primary: '#2BAC76',
  },
  midnight: {
    name: 'Midnight',
    sidebar: '#1a1d21',
    sidebarHover: '#27292d',
    sidebarActive: '#1164A3',
    accent: '#1a1d21',
    accentHover: '#27292d',
    primary: '#36C5F0',
  },
  ocean: {
    name: 'Ocean',
    sidebar: '#0d3b66',
    sidebarHover: '#145088',
    sidebarActive: '#36C5F0',
    accent: '#0d3b66',
    accentHover: '#145088',
    primary: '#36C5F0',
  },
  forest: {
    name: 'Forest',
    sidebar: '#1B4332',
    sidebarHover: '#2D6A4F',
    sidebarActive: '#40916C',
    accent: '#1B4332',
    accentHover: '#2D6A4F',
    primary: '#52B788',
  },
  sunset: {
    name: 'Sunset',
    sidebar: '#5C2018',
    sidebarHover: '#7B2D1E',
    sidebarActive: '#E85D04',
    accent: '#5C2018',
    accentHover: '#7B2D1E',
    primary: '#F48C06',
  },
  lavender: {
    name: 'Lavender',
    sidebar: '#4A4063',
    sidebarHover: '#5E5377',
    sidebarActive: '#9381FF',
    accent: '#4A4063',
    accentHover: '#5E5377',
    primary: '#B8B8FF',
  },
  cherry: {
    name: 'Cherry',
    sidebar: '#590D22',
    sidebarHover: '#800F2F',
    sidebarActive: '#FF4D6D',
    accent: '#590D22',
    accentHover: '#800F2F',
    primary: '#FF758F',
  },
  slate: {
    name: 'Slate',
    sidebar: '#334155',
    sidebarHover: '#475569',
    sidebarActive: '#0EA5E9',
    accent: '#334155',
    accentHover: '#475569',
    primary: '#38BDF8',
  },
  coffee: {
    name: 'Coffee',
    sidebar: '#3E2723',
    sidebarHover: '#4E342E',
    sidebarActive: '#8D6E63',
    accent: '#3E2723',
    accentHover: '#4E342E',
    primary: '#A1887F',
  },
  arctic: {
    name: 'Arctic',
    sidebar: '#1E3A5F',
    sidebarHover: '#2E5077',
    sidebarActive: '#4DA8DA',
    accent: '#1E3A5F',
    accentHover: '#2E5077',
    primary: '#89CFF0',
  },
  ember: {
    name: 'Ember',
    sidebar: '#2D1B0E',
    sidebarHover: '#442915',
    sidebarActive: '#D35400',
    accent: '#2D1B0E',
    accentHover: '#442915',
    primary: '#E67E22',
  },
  noir: {
    name: 'Noir',
    sidebar: '#0D0D0D',
    sidebarHover: '#1A1A1A',
    sidebarActive: '#404040',
    accent: '#0D0D0D',
    accentHover: '#1A1A1A',
    primary: '#FFFFFF',
  },
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('bandchat-theme') || 'default';
  });

  useEffect(() => {
    const theme = themes[currentTheme] || themes.default;
    const root = document.documentElement;

    root.style.setProperty('--color-sidebar', theme.sidebar);
    root.style.setProperty('--color-sidebar-hover', theme.sidebarHover);
    root.style.setProperty('--color-sidebar-active', theme.sidebarActive);
    root.style.setProperty('--color-accent', theme.accent);
    root.style.setProperty('--color-accent-hover', theme.accentHover);
    root.style.setProperty('--color-primary', theme.primary);

    localStorage.setItem('bandchat-theme', currentTheme);
  }, [currentTheme]);

  const setTheme = (themeId) => {
    if (themes[themeId]) {
      setCurrentTheme(themeId);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
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
