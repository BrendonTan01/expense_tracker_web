import { useState, useEffect } from 'react';
import { saveToLocalStorage, loadFromLocalStorage } from '../utils/storage';

const THEME_STORAGE_KEY = 'theme_preference';

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(() => {
    const saved = loadFromLocalStorage<string>(THEME_STORAGE_KEY, 'light');
    return saved === 'dark';
  });

  useEffect(() => {
    // Apply theme to document
    if (isDark) {
      document.documentElement.classList.add('dark-mode');
      saveToLocalStorage(THEME_STORAGE_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark-mode');
      saveToLocalStorage(THEME_STORAGE_KEY, 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="btn btn-secondary"
      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? '☀️' : '🌙'} {isDark ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
