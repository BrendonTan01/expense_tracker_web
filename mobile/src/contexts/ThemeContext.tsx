import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { saveToStorage, loadFromStorage } from '../utils/storage';
import { ACCENT_PALETTES, AccentPalette, DEFAULT_ACCENT_ID, ThemeColors, getLightColors, getDarkColors } from '../theme/colors';
import { FontSizePreset, FontSizes, getFontSizes } from '../theme/typography';
import { Spacing, BorderRadius, spacing as defaultSpacing, compactSpacing, borderRadius } from '../theme/spacing';

const THEME_STORAGE_KEY = 'theme_prefs';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePrefs {
  mode: ThemePreference;
  accentId: string;
  fontSizePreset: FontSizePreset;
  compact: boolean;
}

const DEFAULT_PREFS: ThemePrefs = {
  mode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  fontSizePreset: 'medium',
  compact: false,
};

export interface Theme {
  colors: ThemeColors;
  spacing: Spacing;
  borderRadius: BorderRadius;
  fontSize: FontSizes;
  isDark: boolean;
  accent: AccentPalette;
  compact: boolean;
}

interface ThemeContextType {
  theme: Theme;
  prefs: ThemePrefs;
  setMode: (mode: ThemePreference) => void;
  setAccent: (accentId: string) => void;
  setFontSizePreset: (preset: FontSizePreset) => void;
  setCompact: (compact: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  // Load persisted prefs on mount
  useEffect(() => {
    loadFromStorage<ThemePrefs>(THEME_STORAGE_KEY, DEFAULT_PREFS).then((saved) => {
      setPrefs({ ...DEFAULT_PREFS, ...saved });
      setLoaded(true);
    });
  }, []);

  // Persist whenever prefs change (after initial load)
  useEffect(() => {
    if (loaded) {
      saveToStorage(THEME_STORAGE_KEY, prefs);
    }
  }, [prefs, loaded]);

  const resolvedMode: ResolvedTheme = prefs.mode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : prefs.mode;

  const accent = ACCENT_PALETTES.find(p => p.id === prefs.accentId) || ACCENT_PALETTES[0];

  const theme: Theme = useMemo(() => {
    const isDark = resolvedMode === 'dark';
    const colors = isDark ? getDarkColors(accent) : getLightColors(accent);
    const sp = prefs.compact ? compactSpacing : defaultSpacing;
    const fs = getFontSizes(prefs.fontSizePreset);
    return { colors, spacing: sp, borderRadius, fontSize: fs, isDark, accent, compact: prefs.compact };
  }, [resolvedMode, accent, prefs.compact, prefs.fontSizePreset]);

  const setMode = useCallback((mode: ThemePreference) => setPrefs(p => ({ ...p, mode })), []);
  const setAccent = useCallback((accentId: string) => setPrefs(p => ({ ...p, accentId })), []);
  const setFontSizePreset = useCallback((fontSizePreset: FontSizePreset) => setPrefs(p => ({ ...p, fontSizePreset })), []);
  const setCompact = useCallback((compact: boolean) => setPrefs(p => ({ ...p, compact })), []);

  const value = useMemo(
    () => ({ theme, prefs, setMode, setAccent, setFontSizePreset, setCompact }),
    [theme, prefs, setMode, setAccent, setFontSizePreset, setCompact]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
