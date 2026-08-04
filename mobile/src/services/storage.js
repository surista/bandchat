import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_EMOJIS_KEY = 'recentEmojis';
const MAX_RECENT_EMOJIS = 20;
const OFFLINE_QUEUE_KEY = 'offlineMessageQueue';

const FALLBACK_PREFIX = '__fallback_';

/**
 * Storage service with error tracking and AsyncStorage fallback for token persistence.
 * Primary: expo-secure-store (encrypted). Fallback: AsyncStorage (if SecureStore fails
 * under memory pressure on Android).
 */
const storage = {
  _lastError: null,

  async getItem(key) {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;
    } catch (error) {
      this._lastError = { operation: 'get', key, error: error.message, timestamp: Date.now() };
    }
    // Fallback: check AsyncStorage
    try {
      return await AsyncStorage.getItem(FALLBACK_PREFIX + key);
    } catch {
      return null;
    }
  },

  /**
   * Store a value securely. Falls back to AsyncStorage if SecureStore fails.
   * Returns true if stored in at least one location.
   */
  async setItem(key, value) {
    let secureOk = false;
    try {
      await SecureStore.setItemAsync(key, value);
      secureOk = true;
      // Clean up fallback if secure store succeeds
      AsyncStorage.removeItem(FALLBACK_PREFIX + key).catch(() => {});
    } catch (error) {
      this._lastError = { operation: 'set', key, error: error.message, timestamp: Date.now() };
    }

    if (!secureOk) {
      // Fallback to AsyncStorage so tokens survive process kill
      try {
        await AsyncStorage.setItem(FALLBACK_PREFIX + key, value);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  },

  async removeItem(key) {
    let ok = false;
    try {
      await SecureStore.deleteItemAsync(key);
      ok = true;
    } catch (error) {
      this._lastError = { operation: 'remove', key, error: error.message, timestamp: Date.now() };
    }
    try {
      await AsyncStorage.removeItem(FALLBACK_PREFIX + key);
      ok = true;
    } catch {}
    return ok;
  },

  getLastError() {
    return this._lastError;
  },
};

export default storage;

/**
 * Recent emojis (non-sensitive, uses AsyncStorage).
 *
 * Legacy MRU list, superseded by the frequency ranking in
 * utils/emojiFrequency.js — which reads this once to seed itself so existing
 * users keep their history. Pickers should use `getFrequentEmojis` instead.
 */
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
  } catch (e) {
    console.error('Failed to add message to offline queue:', e);
  }
}

export async function removeFromOfflineQueue(tempId) {
  try {
    const queue = await getOfflineQueue();
    const filtered = queue.filter(m => m.tempId !== tempId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to remove message from offline queue:', e);
  }
}

// ─── UI state helpers ───────────────────────────────────────────────────────
//
// Non-sensitive per-screen state (collapsed groups, scroll positions, blocked
// preview domains, last-workspace cache). Every operation swallows errors and
// returns a safe default — a transient AsyncStorage failure must never crash
// a screen that's only trying to persist a UI preference.
//
// Tokens stay on SecureStore via the `storage` default export above. Anything
// non-sensitive that previously called `AsyncStorage.getItem`/`setItem`
// directly should move here.

/**
 * Read a JSON-encoded UI state value. Returns `fallback` if the key is missing,
 * the JSON is corrupted, or AsyncStorage fails.
 */
export async function getUiState(key, fallback = null) {
  try {
    const v = await AsyncStorage.getItem(key);
    if (v === null) return fallback;
    try { return JSON.parse(v); }
    catch { return fallback; }
  } catch {
    return fallback;
  }
}

/** Write a JSON-encoded UI state value. Returns true on success. Never throws. */
export async function setUiState(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Read a raw string UI state value. */
export async function getUiString(key, fallback = null) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Write a raw string UI state value. Never throws. */
export async function setUiString(key, value) {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove a UI state key. Never throws. */
export async function removeUiState(key) {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
