export interface AccentPalette {
  id: string;
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
}

export const ACCENT_PALETTES: AccentPalette[] = [
  { id: 'indigo', name: 'Indigo', primary: '#6366f1', primaryDark: '#4f46e5', primaryLight: '#818cf8' },
  { id: 'blue', name: 'Blue', primary: '#3b82f6', primaryDark: '#2563eb', primaryLight: '#60a5fa' },
  { id: 'teal', name: 'Teal', primary: '#14b8a6', primaryDark: '#0d9488', primaryLight: '#2dd4bf' },
  { id: 'green', name: 'Green', primary: '#10b981', primaryDark: '#059669', primaryLight: '#34d399' },
  { id: 'orange', name: 'Orange', primary: '#f97316', primaryDark: '#ea580c', primaryLight: '#fb923c' },
  { id: 'pink', name: 'Pink', primary: '#ec4899', primaryDark: '#db2777', primaryLight: '#f472b6' },
  { id: 'red', name: 'Red', primary: '#ef4444', primaryDark: '#dc2626', primaryLight: '#f87171' },
  { id: 'purple', name: 'Purple', primary: '#a855f7', primaryDark: '#9333ea', primaryLight: '#c084fc' },
];

export const DEFAULT_ACCENT_ID = 'indigo';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  success: string;
  danger: string;
  warning: string;
  income: string;
  expense: string;
  investment: string;
  tabBar: string;
  tabBarBorder: string;
  statusBar: 'light-content' | 'dark-content';
}

export function getLightColors(accent: AccentPalette): ThemeColors {
  return {
    primary: accent.primary,
    primaryDark: accent.primaryDark,
    primaryLight: accent.primaryLight,
    background: '#f8f9fa',
    surface: '#ffffff',
    surfaceElevated: '#ffffff',
    text: '#1a1a2e',
    textSecondary: '#64748b',
    textTertiary: '#94a3b8',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    income: '#10b981',
    expense: '#ef4444',
    investment: '#6366f1',
    tabBar: '#ffffff',
    tabBarBorder: '#e2e8f0',
    statusBar: 'dark-content',
  };
}

export function getDarkColors(accent: AccentPalette): ThemeColors {
  return {
    primary: accent.primary,
    primaryDark: accent.primaryDark,
    primaryLight: accent.primaryLight,
    background: '#0b1220',
    surface: '#131d2e',
    surfaceElevated: '#1a2740',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    border: '#1e3048',
    borderLight: '#162236',
    success: '#34d399',
    danger: '#f87171',
    warning: '#fbbf24',
    income: '#34d399',
    expense: '#f87171',
    investment: '#818cf8',
    tabBar: '#0f1a2b',
    tabBarBorder: '#1e3048',
    statusBar: 'light-content',
  };
}
