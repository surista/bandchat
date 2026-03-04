import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_EMOJIS_KEY = 'recentEmojis';
const MAX_RECENT_EMOJIS = 20;
const OFFLINE_QUEUE_KEY = 'offlineMessageQueue';

/**
 * Storage service with error tracking for secure token persistence.
 * Uses expo-secure-store for encrypted storage on device.
 */
const storage = {
  /** Track if we've had a storage failure (for diagnostic purposes) */
  _lastError: null,

  async getItem(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      this._lastError = { operation: 'get', key, error: error.message, timestamp: Date.now() };
      return null;
    }
  },

  /**
   * Store a value securely. Returns true on success, false on failure.
   * Important: Token storage failures can cause re-login loops.
   */
  async setItem(key, value) {
    try {
      await SecureStore.setItemAsync(key, value);
      return true;
    } catch (error) {
      this._lastError = { operation: 'set', key, error: error.message, timestamp: Date.now() };
      return false;
    }
  },

  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (error) {
      this._lastError = { operation: 'remove', key, error: error.message, timestamp: Date.now() };
      return false;
    }
  },

  /** Get the last storage error for diagnostics */
  getLastError() {
    return this._lastError;
  },
};

export default storage;

/** Recent emojis (non-sensitive, uses AsyncStorage) */
export async function getRecentEmojis() {
  try {
    const json = await AsyncStorage.getItem(RECENT_EMOJIS_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function addRecentEmoji(emoji) {
  try {
    const recent = await getRecentEmojis();
    const filtered = recent.filter(e => e !== emoji);
    filtered.unshift(emoji);
    const trimmed = filtered.slice(0, MAX_RECENT_EMOJIS);
    await AsyncStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [];
  }
}

/** Offline message queue (text messages only) */
export async function getOfflineQueue() {
  try {
    const json = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function addToOfflineQueue(message) {
  try {
    const queue = await getOfflineQueue();
    queue.push(message);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function removeFromOfflineQueue(tempId) {
  try {
    const queue = await getOfflineQueue();
    const filtered = queue.filter(m => m.tempId !== tempId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch {}
}
