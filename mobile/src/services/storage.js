import * as SecureStore from 'expo-secure-store';

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
      console.warn(`SecureStore.getItem failed for "${key}":`, error.message);
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
      console.error(`SecureStore.setItem failed for "${key}":`, error.message);
      // This is critical for auth tokens - log enough detail to diagnose
      if (key.includes('Token')) {
        console.error('Token storage failed - user may need to re-authenticate on app restart');
      }
      return false;
    }
  },

  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (error) {
      this._lastError = { operation: 'remove', key, error: error.message, timestamp: Date.now() };
      console.warn(`SecureStore.removeItem failed for "${key}":`, error.message);
      return false;
    }
  },

  /** Get the last storage error for diagnostics */
  getLastError() {
    return this._lastError;
  },
};

export default storage;
