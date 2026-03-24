// Mock native modules
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const SecureStore = require('expo-secure-store');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { default: storage, getRecentEmojis, addRecentEmoji, getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue } = require('../storage');

beforeEach(() => {
  jest.clearAllMocks();
  storage._lastError = null;
});

// ───────────────────────────────────────────────────
// Secure Storage (tokens)
// ───────────────────────────────────────────────────

describe('storage (SecureStore)', () => {
  describe('getItem', () => {
    test('returns value from SecureStore', async () => {
      SecureStore.getItemAsync.mockResolvedValueOnce('my-token');
      const result = await storage.getItem('accessToken');
      expect(result).toBe('my-token');
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('accessToken');
    });

    test('returns null and tracks error on failure', async () => {
      SecureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain not available'));
      const result = await storage.getItem('accessToken');
      expect(result).toBeNull();
      expect(storage._lastError).toMatchObject({
        operation: 'get',
        key: 'accessToken',
        error: 'Keychain not available',
      });
    });
  });

  describe('setItem', () => {
    test('returns true on success', async () => {
      SecureStore.setItemAsync.mockResolvedValueOnce();
      const result = await storage.setItem('accessToken', 'abc');
      expect(result).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'abc');
    });

    test('returns false and tracks error on failure', async () => {
      SecureStore.setItemAsync.mockRejectedValueOnce(new Error('Storage full'));
      const result = await storage.setItem('accessToken', 'abc');
      expect(result).toBe(false);
      expect(storage._lastError).toMatchObject({
        operation: 'set',
        key: 'accessToken',
      });
    });
  });

  describe('removeItem', () => {
    test('returns true on success', async () => {
      SecureStore.deleteItemAsync.mockResolvedValueOnce();
      const result = await storage.removeItem('refreshToken');
      expect(result).toBe(true);
    });

    test('returns false on failure', async () => {
      SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('fail'));
      const result = await storage.removeItem('refreshToken');
      expect(result).toBe(false);
    });
  });

  describe('getLastError', () => {
    test('returns null initially', () => {
      expect(storage.getLastError()).toBeNull();
    });

    test('returns error after failure', async () => {
      SecureStore.getItemAsync.mockRejectedValueOnce(new Error('oops'));
      await storage.getItem('test');
      const err = storage.getLastError();
      expect(err).toMatchObject({ operation: 'get', key: 'test' });
      expect(err.timestamp).toBeDefined();
    });
  });
});

// ───────────────────────────────────────────────────
// Recent Emojis (AsyncStorage)
// ───────────────────────────────────────────────────

describe('Recent Emojis', () => {
  test('getRecentEmojis returns empty array when no data', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    const result = await getRecentEmojis();
    expect(result).toEqual([]);
  });

  test('getRecentEmojis returns parsed array', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(['😀', '🎸']));
    const result = await getRecentEmojis();
    expect(result).toEqual(['😀', '🎸']);
  });

  test('getRecentEmojis returns empty on parse error', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('fail'));
    const result = await getRecentEmojis();
    expect(result).toEqual([]);
  });

  test('addRecentEmoji adds to front', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(['🎸', '🥁']));
    const result = await addRecentEmoji('🎹');
    expect(result[0]).toBe('🎹');
    expect(result).toContain('🎸');
  });

  test('addRecentEmoji deduplicates', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(['🎸', '🥁']));
    const result = await addRecentEmoji('🎸');
    expect(result[0]).toBe('🎸');
    expect(result.filter(e => e === '🎸').length).toBe(1);
  });

  test('addRecentEmoji caps at 20', async () => {
    const emojis = Array.from({ length: 25 }, (_, i) => `emoji-${i}`);
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(emojis));
    const result = await addRecentEmoji('new');
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

// ───────────────────────────────────────────────────
// Offline Queue (AsyncStorage)
// ───────────────────────────────────────────────────

describe('Offline Queue', () => {
  test('getOfflineQueue returns empty array when no data', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    const result = await getOfflineQueue();
    expect(result).toEqual([]);
  });

  test('getOfflineQueue returns stored messages', async () => {
    const msgs = [{ tempId: '1', content: 'hello' }];
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(msgs));
    const result = await getOfflineQueue();
    expect(result).toEqual(msgs);
  });

  test('addToOfflineQueue appends message', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([{ tempId: '1' }]));
    await addToOfflineQueue({ tempId: '2', content: 'world' });

    const savedData = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
    expect(savedData).toHaveLength(2);
    expect(savedData[1].tempId).toBe('2');
  });

  test('removeFromOfflineQueue removes by tempId', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify([{ tempId: '1' }, { tempId: '2' }])
    );
    await removeFromOfflineQueue('1');

    const savedData = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
    expect(savedData).toHaveLength(1);
    expect(savedData[0].tempId).toBe('2');
  });
});
