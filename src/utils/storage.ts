// Storage utilities for client-side data (templates, presets, goals, theme)

const STORAGE_PREFIX = 'expense_tracker_';

export function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function saveToLocalStorage<T>(key: string, data: T): void {
  try {
    const storageKey = getStorageKey(key);
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save to localStorage: ${key}`, error);
  }
}

export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const storageKey = getStorageKey(key);
    const item = localStorage.getItem(storageKey);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Failed to load from localStorage: ${key}`, error);
    return defaultValue;
  }
}

export function removeFromLocalStorage(key: string): void {
  try {
    const storageKey = getStorageKey(key);
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error(`Failed to remove from localStorage: ${key}`, error);
  }
}

// Generate a simple ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
