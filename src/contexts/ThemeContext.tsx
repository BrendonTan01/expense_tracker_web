import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { loadFromLocalStorage, saveToLocalStorage } from '../utils/storage';

const THEME_STORAGE_KEY = 'theme_preference';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function normalizePreference(value: unknown): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = loadFromLocalStorage<unknown>(THEME_STORAGE_KEY, 'system');
    return normalizePreference(saved);
  });

  const resolvedTheme: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  // Listen for device theme changes (only matters when preference === 'system')
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(mql.matches ? 'dark' : 'light');

    // Set initial in case it changed between initial render and effect.
    onChange();

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    // Safari < 14 fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, []);

  // Persist user preference
  useEffect(() => {
    saveToLocalStorage(THEME_STORAGE_KEY, preference);
  }, [preference]);

  // Apply theme class to the root element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark-mode', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
