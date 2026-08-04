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

const AsyncStorage = require('@react-native-async-storage/async-storage');

const KEY = 'emojiFrequency';
const RECENT_KEY = 'recentEmojis';

/** Route AsyncStorage.getItem at a fake store, resetting the module cache. */
function useStore(store) {
  AsyncStorage.getItem.mockImplementation(key =>
    Promise.resolve(Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)
  );
  AsyncStorage.setItem.mockImplementation((key, value) => {
    store[key] = value;
    return Promise.resolve();
  });
}

function load() {
  let mod;
  jest.isolateModules(() => { mod = require('../emojiFrequency'); });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getFrequentEmojis', () => {
  test('ranks by usage count, highest first', async () => {
    useStore({ [KEY]: JSON.stringify({ '🎸': { n: 3, t: 1 }, '🔥': { n: 9, t: 1 }, '😂': { n: 5, t: 1 } }) });
    const { getFrequentEmojis } = load();
    const result = await getFrequentEmojis(3);
    expect(result).toEqual(['🔥', '😂', '🎸']);
  });

  test('breaks count ties with most recent use', async () => {
    useStore({ [KEY]: JSON.stringify({ '🎸': { n: 2, t: 100 }, '🔥': { n: 2, t: 900 } }) });
    const { getFrequentEmojis } = load();
    expect(await getFrequentEmojis(2)).toEqual(['🔥', '🎸']);
  });

  test('pads a short history with defaults, without duplicating', async () => {
    useStore({ [KEY]: JSON.stringify({ '🎸': { n: 4, t: 1 }, '👍': { n: 2, t: 1 } }) });
    const { getFrequentEmojis, DEFAULT_FREQUENT } = load();
    const result = await getFrequentEmojis(6);

    expect(result).toHaveLength(6);
    expect(result.slice(0, 2)).toEqual(['🎸', '👍']);
    expect(new Set(result).size).toBe(6);
    // 👍 is a default but was already ranked — it must not appear twice.
    expect(result.filter(e => e === '👍')).toHaveLength(1);
    expect(DEFAULT_FREQUENT).toContain('👍');
  });

  test('returns defaults when nothing has been tracked', async () => {
    useStore({});
    const { getFrequentEmojis, DEFAULT_FREQUENT } = load();
    expect(await getFrequentEmojis(4)).toEqual(DEFAULT_FREQUENT.slice(0, 4));
  });

  test('seeds from the legacy recentEmojis list on first run', async () => {
    useStore({ [RECENT_KEY]: JSON.stringify(['🥁', '🎤', '🎸']) });
    const { getFrequentEmojis } = load();
    // MRU order is preserved: most recent gets the highest seeded count.
    expect(await getFrequentEmojis(3)).toEqual(['🥁', '🎤', '🎸']);
  });

  test('migrates the legacy web `{ emoji: count }` shape', async () => {
    useStore({ [KEY]: JSON.stringify({ '🎸': 2, '🔥': 7 }) });
    const { getFrequentEmojis } = load();
    expect(await getFrequentEmojis(2)).toEqual(['🔥', '🎸']);
  });

  test('survives corrupt stored data', async () => {
    useStore({ [KEY]: 'not json' });
    const { getFrequentEmojis, DEFAULT_FREQUENT } = load();
    expect(await getFrequentEmojis(3)).toEqual(DEFAULT_FREQUENT.slice(0, 3));
  });
});

describe('trackEmojiUsage', () => {
  test('increments the count and persists it', async () => {
    const store = { [KEY]: JSON.stringify({ '🎸': { n: 1, t: 1 } }) };
    useStore(store);
    const { trackEmojiUsage } = load();

    await trackEmojiUsage('🎸');
    expect(JSON.parse(store[KEY])['🎸'].n).toBe(2);
  });

  test('promotes an emoji once it overtakes the others', async () => {
    const store = { [KEY]: JSON.stringify({ '🔥': { n: 2, t: 1 }, '🎸': { n: 1, t: 1 } }) };
    useStore(store);
    const { trackEmojiUsage } = load();

    await trackEmojiUsage('🎸');
    const result = await trackEmojiUsage('🎸', 2);
    expect(result[0]).toBe('🎸');
  });

  test('ignores an empty emoji', async () => {
    useStore({});
    const { trackEmojiUsage, DEFAULT_FREQUENT } = load();
    expect(await trackEmojiUsage('', 2)).toEqual(DEFAULT_FREQUENT.slice(0, 2));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('halves all counts when one reaches the decay threshold', async () => {
    const store = { [KEY]: JSON.stringify({ '👍': { n: 199, t: 1 }, '🎸': { n: 10, t: 1 } }) };
    useStore(store);
    const { trackEmojiUsage } = load();

    await trackEmojiUsage('👍');
    const saved = JSON.parse(store[KEY]);
    expect(saved['👍'].n).toBe(100);
    expect(saved['🎸'].n).toBe(5);
  });

  test('drops entries that decay to zero', async () => {
    const store = { [KEY]: JSON.stringify({ '👍': { n: 199, t: 1 }, '🎸': { n: 1, t: 1 } }) };
    useStore(store);
    const { trackEmojiUsage } = load();

    await trackEmojiUsage('👍');
    expect(JSON.parse(store[KEY])['🎸']).toBeUndefined();
  });

  test('caps the stored map at 60 entries, keeping the most used', async () => {
    const seed = {};
    for (let i = 0; i < 60; i++) seed[`e${i}`] = { n: i + 2, t: 1 };
    const store = { [KEY]: JSON.stringify(seed) };
    useStore(store);
    const { trackEmojiUsage } = load();

    await trackEmojiUsage('🆕');
    const saved = JSON.parse(store[KEY]);
    expect(Object.keys(saved)).toHaveLength(60);
    // The single least-used entry is evicted; the newcomer is kept.
    expect(saved['e0']).toBeUndefined();
    expect(saved['🆕'].n).toBe(1);
  });
});

describe('peekFrequentEmojis', () => {
  test('returns defaults before anything has been loaded', () => {
    useStore({});
    const { peekFrequentEmojis, DEFAULT_FREQUENT } = load();
    expect(peekFrequentEmojis(3)).toEqual(DEFAULT_FREQUENT.slice(0, 3));
  });

  test('returns the last loaded ranking synchronously', async () => {
    useStore({ [KEY]: JSON.stringify({ '🎸': { n: 3, t: 1 }, '🔥': { n: 9, t: 1 } }) });
    const { getFrequentEmojis, peekFrequentEmojis } = load();

    await getFrequentEmojis(2);
    expect(peekFrequentEmojis(2)).toEqual(['🔥', '🎸']);
  });
});
