export type ThemeName = 'dark' | 'ocean' | 'light';

export const THEMES = {
  dark: { 
    name: 'Dark', 
    colors: { bg: '#0a0a0f', sidebar: '#0f1117', card: '#13131a', border: '#1e1e2e', accent: '#f5a623', btnBg: '#f5a623', btnText: '#0a0a0f', text: '#f8fafc', textSecondary: '#94a3b8' },
    shadows: { card: '0 0 0 1px rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.3)', cardHover: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)' },
    isLight: false
  },
  ocean: { 
    name: 'Ocean', 
    colors: { bg: '#080c14', sidebar: '#0c1220', card: '#101828', border: '#1e2d45', accent: '#3b82f6', btnBg: '#3b82f6', btnText: '#ffffff', text: '#f0f4ff', textSecondary: '#94a3b8' },
    shadows: { card: '0 0 0 1px rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.3)', cardHover: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)' },
    isLight: false
  },
  light: { 
    name: 'Light', 
    colors: { bg: '#f8fafc', sidebar: '#ffffff', card: '#ffffff', border: '#e2e8f0', accent: '#1e293b', btnBg: '#1e293b', btnText: '#ffffff', text: '#0f172a', textSecondary: '#64748b' },
    shadows: { card: '0 1px 3px rgba(0,0,0,0.1)', cardHover: '0 4px 12px rgba(0,0,0,0.1)' },
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
  if (['dark', 'ocean', 'light'].includes(current)) return current;
  return 'dark';
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
  root.style.setProperty('--gold-glow', `${hexToHslParams(theme.colors.accent)} / 0.15`);
  
  root.style.setProperty('--theme-text', hexToHslParams(theme.colors.text));
  root.style.setProperty('--theme-text-sec', hexToHslParams(theme.colors.textSecondary));
  
  // Conditionally toggle light class for specific CSS overrides (e.g. alternate rows)
  if (theme.isLight) {
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
  }

  // Trigger an event so canvas components can react
  window.dispatchEvent(new Event('themechange'));
}
