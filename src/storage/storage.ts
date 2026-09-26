import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageAdapter } from './types';

export const asyncStorageAdapter: StorageAdapter = {
  async read<T>(key: string) {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  },
  async write<T>(key: string, value: T) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative for the session.
    }
  },
  async remove(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative for the session.
    }
  },
};
