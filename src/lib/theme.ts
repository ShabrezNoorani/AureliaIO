import { useState, useEffect } from 'react';

export type ThemeName = 'dark' | 'light';

export const THEMES = {
  dark: {
    name: 'Dark',
    colors: { bg: '#0a0a0f', sidebar: '#0f1117', card: '#13131a', border: '#1e1e2e', accent: '#f5a623', btnBg: '#f5a623', btnText: '#0a0a0f', text: '#f8fafc', textSecondary: '#94a3b8', textMuted: '#4b5563' },
    shadows: { card: '0 0 0 1px rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.3)', cardHover: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)' },
    isLight: false
  },
  // Warm off-white background with pure-white cards (visible separation), deep amber-gold as the
  // accent (kept from the brand, but darkened from the bright #f5a623 dark-mode gold — that shade
  // is ~1.9:1 against white and unreadable as text/borders on a light page; this amber-700 shade
  // is ~5:1, comfortably passing WCAG AA for normal text while still reading unmistakably "gold").
  light: {
    name: 'Light',
    colors: { bg: '#F7F6F3', sidebar: '#FFFFFF', card: '#FFFFFF', border: '#E5E1D8', accent: '#B45309', btnBg: '#B45309', btnText: '#FFFFFF', text: '#1C1917', textSecondary: '#44403C', textMuted: '#78716C' },
    shadows: { card: '0 1px 2px rgba(28,25,23,0.04), 0 1px 3px rgba(28,25,23,0.06)', cardHover: '0 2px 6px rgba(28,25,23,0.06), 0 6px 16px rgba(28,25,23,0.08)' },
    isLight: true
  }
};

function hexToHslParams(hex: string) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function getTheme(): ThemeName {
  const current = localStorage.getItem('aurelia_theme') as ThemeName;
  if (['dark', 'light'].includes(current)) return current;
  return 'light';
}

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName];
  if (!theme) return;
  
  localStorage.setItem('aurelia_theme', themeName);
  
  const root = document.documentElement;
  root.style.setProperty('--theme-bg', hexToHslParams(theme.colors.bg));
  root.style.setProperty('--theme-sidebar', hexToHslParams(theme.colors.sidebar));
  root.style.setProperty('--theme-card', hexToHslParams(theme.colors.card));
  root.style.setProperty('--theme-border', hexToHslParams(theme.colors.border));
  root.style.setProperty('--theme-accent', hexToHslParams(theme.colors.accent));
  
  root.style.setProperty('--theme-btn-bg', hexToHslParams(theme.colors.btnBg));
  root.style.setProperty('--theme-btn-text', hexToHslParams(theme.colors.btnText));
  root.style.setProperty('--card-shadow-var', theme.shadows.card);
  root.style.setProperty('--card-shadow-hover-var', theme.shadows.cardHover);
  
  // Custom parsing for accent hex just to get rgb for glow or set directly
  root.style.setProperty('--gold', hexToHslParams(theme.colors.accent));
  root.style.setProperty('--theme-text', hexToHslParams(theme.colors.text));
  root.style.setProperty('--theme-text-sec', hexToHslParams(theme.colors.textSecondary));
  root.style.setProperty('--theme-text-muted', hexToHslParams(theme.colors.textMuted));

  // A softer glow on light backgrounds — the same strength dark mode uses would look muddy on white.
  root.style.setProperty('--gold-glow', `${hexToHslParams(theme.colors.accent)} / ${themeName === 'light' ? '0.12' : '0.15'}`);
  
  // Conditionally toggle light class for specific CSS overrides (e.g. alternate rows)
  if (theme.isLight) {
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
  }

  // Trigger an event so canvas components can react
  window.dispatchEvent(new Event('themechange'));
}

export function useChartColors() {
  const [theme, setTheme] = useState<ThemeName>(getTheme());

  useEffect(() => {
    const handleThemeChange = () => {
      setTheme(getTheme());
    };
    window.addEventListener('themechange', handleThemeChange);
    return () => window.removeEventListener('themechange', handleThemeChange);
  }, []);

  if (theme === 'light') {
    return {
      primary: '#B45309',    // Gold (light-mode shade — see THEMES.light comment)
      secondary: '#16a34a',  // Green
      line: '#B45309',       // Gold
      grid: 'rgba(28,25,23,0.08)',
      text: '#78716C',
      tooltip: {
        bg: '#ffffff',
        border: '#E5E1D8',
        text: '#1C1917'
      },
      donut: ['#B45309', '#16a34a', '#2563eb', '#9333ea', '#dc2626']
    };
  }

  return {
    primary: '#f5a623',    // Gold
    secondary: '#22c55e',  // Green
    line: '#f5a623',       // Gold
    grid: 'rgba(255,255,255,0.1)',
    text: '#94a3b8',
    tooltip: {
      bg: '#13131a',
      border: '#2a2a3e',
      text: '#f8fafc'
    },
    donut: ['#f5a623', '#22c55e', '#60a5fa', '#c084fc', '#f87171']
  };
}
