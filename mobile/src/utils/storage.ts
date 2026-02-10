import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@expense_tracker/';

export function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export async function saveToStorage<T>(key: string, data: T): Promise<void> {
  try {
    const storageKey = getStorageKey(key);
    await AsyncStorage.setItem(storageKey, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save to storage: ${key}`, error);
  }
}

export async function loadFromStorage<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const storageKey = getStorageKey(key);
    const item = await AsyncStorage.getItem(storageKey);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Failed to load from storage: ${key}`, error);
    return defaultValue;
  }
}

export async function removeFromStorage(key: string): Promise<void> {
  try {
    const storageKey = getStorageKey(key);
    await AsyncStorage.removeItem(storageKey);
  } catch (error) {
    console.error(`Failed to remove from storage: ${key}`, error);
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
