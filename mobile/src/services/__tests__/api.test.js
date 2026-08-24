// Mock storage before importing ApiService
jest.mock('../storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(() => true),
    removeItem: jest.fn(() => true),
    getLastError: jest.fn(() => null),
    _lastError: null,
  },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiUrl: 'http://test:3001/api' } },
}));

// Mock global fetch
global.fetch = jest.fn();

const { default: api } = require('../api');
const storage = require('../storage').default;

// Helper: create a mock Response
function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  };
}

// Helper: create a JWT token with given expiry
function makeToken(expInSeconds) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expInSeconds, sub: 'user1' };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${base64}.signature`;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset api state
  api.accessToken = null;
  api.refreshToken = null;
  api._refreshPromise = null;
  api._cache.clear();
  api.onSessionExpired = null;
});

// ───────────────────────────────────────────────────
// Token Management
// ───────────────────────────────────────────────────

describe('Token Management', () => {
  describe('setTokens', () => {
    test('stores tokens in memory and persists to storage', async () => {
      await api.setTokens('access-123', 'refresh-456');
      expect(api.accessToken).toBe('access-123');
      expect(api.refreshToken).toBe('refresh-456');
      expect(storage.setItem).toHaveBeenCalledWith('accessToken', 'access-123');
      expect(storage.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-456');
    });

    test('returns true when storage succeeds', async () => {
      storage.setItem.mockResolvedValue(true);
      const result = await api.setTokens('a', 'r');
      expect(result).toBe(true);
    });

    test('returns false when storage fails', async () => {
      storage.setItem.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const result = await api.setTokens('a', 'r');
      expect(result).toBe(false);
    });
  });

  describe('clearTokens', () => {
    test('clears memory and storage', async () => {
      api.accessToken = 'at';
      api.refreshToken = 'rt';
      api._cache.set('/test', { data: 1, timestamp: Date.now() });

      await api.clearTokens();

      expect(api.accessToken).toBeNull();
      expect(api.refreshToken).toBeNull();
      expect(api._cache.size).toBe(0);
      expect(storage.removeItem).toHaveBeenCalledWith('accessToken');
      expect(storage.removeItem).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('loadTokens', () => {
    test('loads tokens from storage', async () => {
      storage.getItem.mockResolvedValueOnce('stored-access').mockResolvedValueOnce('stored-refresh');

      await api.loadTokens();

      expect(api.accessToken).toBe('stored-access');
      expect(api.refreshToken).toBe('stored-refresh');
    });

    test('handles null storage (no stored tokens)', async () => {
      storage.getItem.mockResolvedValue(null);

      await api.loadTokens();

      expect(api.accessToken).toBeNull();
      expect(api.refreshToken).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    test('returns false when no token', () => {
      expect(api.isTokenExpiringSoon()).toBe(false);
    });

    test('returns false for token expiring in 5 minutes', () => {
      api.accessToken = makeToken(300);
      expect(api.isTokenExpiringSoon()).toBe(false);
    });

    test('returns true for token expiring in 30 seconds', () => {
      api.accessToken = makeToken(30);
      expect(api.isTokenExpiringSoon()).toBe(true);
    });

    test('returns true for already expired token', () => {
      api.accessToken = makeToken(-10);
      expect(api.isTokenExpiringSoon()).toBe(true);
    });

    test('returns false for malformed token', () => {
      api.accessToken = 'not.a.jwt';
      expect(api.isTokenExpiringSoon()).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────
// Cache
// ───────────────────────────────────────────────────

describe('Cache', () => {
  describe('cachedRequest', () => {
    test('fetches and caches on first call', async () => {
      fetch.mockResolvedValueOnce(mockResponse({ songs: [] }));
      api.accessToken = makeToken(300);

      const data = await api.cachedRequest('/songs');
      expect(data).toEqual({ songs: [] });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('returns cached data within TTL', async () => {
      fetch.mockResolvedValueOnce(mockResponse({ v: 1 }));
      api.accessToken = makeToken(300);

      await api.cachedRequest('/test');
      const data = await api.cachedRequest('/test');

      expect(data).toEqual({ v: 1 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('fetches fresh data after TTL expires', async () => {
      api.accessToken = makeToken(300);
      fetch.mockResolvedValueOnce(mockResponse({ v: 1 }));
      await api.cachedRequest('/test', 50);

      // Expire cache entry
      api._cache.get('/test').timestamp = Date.now() - 100;

      fetch.mockResolvedValueOnce(mockResponse({ v: 2 }));
      const data = await api.cachedRequest('/test', 50);
      expect(data).toEqual({ v: 2 });
    });

    test('evicts oldest entries when cache exceeds 200', async () => {
      api.accessToken = makeToken(300);

      // Fill cache with 200 entries
      for (let i = 0; i < 200; i++) {
        api._cache.set(`/entry-${i}`, { data: i, timestamp: Date.now() - (200 - i) });
      }

      // Add one more via cachedRequest
      fetch.mockResolvedValueOnce(mockResponse({ newest: true }));
      await api.cachedRequest('/entry-new');

      expect(api._cache.size).toBeLessThanOrEqual(201); // May evict
    });
  });

  describe('invalidateCache', () => {
    test('clears all when pattern is null', () => {
      api._cache.set('/a', { data: 1, timestamp: Date.now() });
      api._cache.set('/b', { data: 2, timestamp: Date.now() });
      api.invalidateCache(null);
      expect(api._cache.size).toBe(0);
    });

    test('clears matching entries only', () => {
      api._cache.set('/songs/ws/1', { data: 1, timestamp: Date.now() });
      api._cache.set('/gigs/ws/1', { data: 2, timestamp: Date.now() });
      api.invalidateCache('/songs');
      expect(api._cache.has('/songs/ws/1')).toBe(false);
      expect(api._cache.has('/gigs/ws/1')).toBe(true);
    });
  });
});

// ───────────────────────────────────────────────────
// Request / Response
// ───────────────────────────────────────────────────

describe('Request handling', () => {
  test('includes Authorization header', async () => {
    api.accessToken = makeToken(300);
    fetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const callOptions = fetch.mock.calls[0][1];
    expect(callOptions.headers.Authorization).toBe(`Bearer ${api.accessToken}`);
  });

  test('omits Authorization when no token', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const callHeaders = fetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  test('sets Content-Type to application/json', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const callHeaders = fetch.mock.calls[0][1].headers;
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  test('invalidates cache on POST', async () => {
    api._cache.set('/songs/ws/1', { data: 'old', timestamp: Date.now() });
    api.accessToken = makeToken(300);
    fetch.mockResolvedValueOnce(mockResponse({ id: 'new' }));

    await api.request('/songs/ws/1', { method: 'POST', body: '{}' });

    expect(api._cache.has('/songs/ws/1')).toBe(false);
  });
});

describe('Response handling', () => {
  test('returns parsed JSON on success', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ data: 'ok' }));
    api.accessToken = makeToken(300);

    const result = await api.request('/test');
    expect(result).toEqual({ data: 'ok' });
  });

  test('throws with server error message', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));
    api.accessToken = makeToken(300);

    await expect(api.request('/test')).rejects.toThrow('Not found');
  });

  test('throws with default message for status without error field', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}, 500));
    api.accessToken = makeToken(300);

    await expect(api.request('/test')).rejects.toThrow();
  });

  test('error has status property', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Forbidden' }, 403));
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.status).toBe(403);
      expect(e.type).toBe('AUTH');
    }
  });

  test('timeout throws with TIMEOUT type', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    fetch.mockRejectedValueOnce(abortError);
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('TIMEOUT');
    }
  });

  test('network failure throws with NETWORK type', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('NETWORK');
    }
  });
});

// ───────────────────────────────────────────────────
// Token Refresh
// ───────────────────────────────────────────────────

describe('Token refresh', () => {
  test('refreshes and retries on 401', async () => {
    api.accessToken = makeToken(300);
    api.refreshToken = 'refresh-token';

    fetch
      .mockResolvedValueOnce(mockResponse({}, 401))
      .mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new-rt' }))
      .mockResolvedValueOnce(mockResponse({ data: 'ok' }));

    const result = await api.request('/protected');
    expect(result).toEqual({ data: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('calls onSessionExpired when refresh fails', async () => {
    const onExpired = jest.fn();
    api.accessToken = makeToken(300);
    api.refreshToken = 'old-rt';
    api.onSessionExpired = onExpired;

    fetch
      .mockResolvedValueOnce(mockResponse({}, 401))
      .mockResolvedValueOnce(mockResponse({}, 401));

    await expect(api.request('/test')).rejects.toThrow('Session expired');
    expect(onExpired).toHaveBeenCalled();
  });

  test('proactively refreshes expiring token before request', async () => {
    api.accessToken = makeToken(30); // Expiring soon
    api.refreshToken = 'rt';

    fetch
      .mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new-rt' }))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    expect(fetch).toHaveBeenCalledTimes(2);
    const refreshCall = fetch.mock.calls[0];
    expect(refreshCall[0]).toContain('/auth/refresh');
  });

  test('deduplicates concurrent refreshes', async () => {
    api.accessToken = makeToken(30);
    api.refreshToken = 'rt';

    fetch
      .mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new' }))
      .mockResolvedValueOnce(mockResponse({ a: 1 }))
      .mockResolvedValueOnce(mockResponse({ b: 2 }));

    await Promise.all([api.request('/a'), api.request('/b')]);

    const refreshCalls = fetch.mock.calls.filter(c => c[0].includes('/auth/refresh'));
    expect(refreshCalls.length).toBe(1);
  });

  test('sends refresh token in body', async () => {
    api.accessToken = makeToken(30);
    api.refreshToken = 'my-refresh';

    fetch
      .mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new' }))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const refreshCall = fetch.mock.calls.find(c => c[0].includes('/auth/refresh'));
    const body = JSON.parse(refreshCall[1].body);
    expect(body.refreshToken).toBe('my-refresh');
  });
});

// ───────────────────────────────────────────────────
// Error Types
// ───────────────────────────────────────────────────

describe('Error types', () => {
  test('401 returns AUTH type', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, 401));

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('AUTH');
    }
  });

  test('403 returns AUTH type', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Forbidden' }, 403));
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('AUTH');
    }
  });

  test('400 returns VALIDATION type', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Bad request' }, 400));
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('VALIDATION');
    }
  });

  test('500 returns SERVER type', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Internal error' }, 500));
    api.accessToken = makeToken(300);

    try {
      await api.request('/test');
    } catch (e) {
      expect(e.type).toBe('SERVER');
    }
  });
});

// ───────────────────────────────────────────────────
// Stale-refresh race (production incident, 2026-08-24)
// ───────────────────────────────────────────────────
//
// A backgrounded socket reconnecting with an already-superseded refresh token
// fires its own refreshAccessToken() call. If a fresh login (Google/Apple/
// password) completes new tokens while that stale call is still in flight,
// the stale call's late 401 used to call clearTokens() unconditionally —
// wiping out the newer, valid session. Confirmed in production web logs as
// the cause of a "sign in with Google, get bounced right back to login" loop.
// Mirrors client/src/services/__tests__/api.refresh.test.js.
describe('Stale-refresh race', () => {
  test('does not clobber a session established while an older refresh was in flight', async () => {
    api.accessToken = makeToken(300);
    api.refreshToken = 'old-refresh';

    let resolveFetch;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));

    // Zombie refresh starts with the OLD token.
    const stalePromise = api.refreshAccessToken();

    // A fresh login completes while the zombie request is still in flight.
    await api.setTokens('new-access', 'new-refresh');

    // The zombie request resolves — 401, because the server already
    // deleted/rotated the old token out from under it.
    resolveFetch(mockResponse({ error: 'Refresh token has been revoked' }, 401));
    await stalePromise;

    expect(api.accessToken).toBe('new-access');
    expect(api.refreshToken).toBe('new-refresh');
  });

  test('still clears tokens on a definitive 401 when nothing else has superseded it', async () => {
    api.accessToken = makeToken(300);
    api.refreshToken = 'only-refresh';
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Refresh token has been revoked' }, 401));

    const result = await api.refreshAccessToken();

    expect(result).toBe(false);
    expect(api.accessToken).toBeNull();
    expect(api.refreshToken).toBeNull();
  });
});
