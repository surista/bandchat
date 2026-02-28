import * as SecureStore from 'expo-secure-store';

const storage = {
  async getItem(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore may fail on some devices/emulators
    }
  },

  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore errors on delete
    }
  },
};

export default storage;
