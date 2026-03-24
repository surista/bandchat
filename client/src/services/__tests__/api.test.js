import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the ApiService class directly by creating new instances
// to avoid singleton state leaking between tests.

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: {} } });

// We need to mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Import after mocks are set up
const { default: api } = await import('../api');

// Helper: create a mock Response
function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

// Helper: create a JWT token with given expiry
function makeToken(expInSeconds) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expInSeconds, sub: 'user1' };
  const base64 = btoa(JSON.stringify(payload));
  return `header.${base64}.signature`;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset api state
  api.accessToken = null;
  api._refreshToken = null;
  api._hasSession = false;
  api._refreshPromise = null;
  api._cache.clear();
});

// ───────────────────────────────────────────────────
// Token Management
// ───────────────────────────────────────────────────

describe('Token Management', () => {
  describe('setTokens', () => {
    it('stores access token', () => {
      api.setTokens('access-123', 'refresh-456');
      expect(api.accessToken).toBe('access-123');
    });

    it('stores refresh token', () => {
      api.setTokens('access-123', 'refresh-456');
      expect(api._refreshToken).toBe('refresh-456');
    });

    it('marks session as active', () => {
      api.setTokens('access-123', 'refresh-456');
      expect(api._hasSession).toBe(true);
    });

    it('does not overwrite refresh token with undefined', () => {
      api.setTokens('access-1', 'refresh-1');
      api.setTokens('access-2');
      expect(api._refreshToken).toBe('refresh-1');
    });
  });

  describe('clearTokens', () => {
    it('clears all tokens', () => {
      api.setTokens('access', 'refresh');
      api.clearTokens();
      expect(api.accessToken).toBeNull();
      expect(api._refreshToken).toBeNull();
      expect(api._hasSession).toBe(false);
    });

    it('clears the cache', () => {
      api._cache.set('/test', { data: 'cached', timestamp: Date.now() });
      api.clearTokens();
      expect(api._cache.size).toBe(0);
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('returns false when no token', () => {
      expect(api.isTokenExpiringSoon()).toBe(false);
    });

    it('returns false for token expiring in 5 minutes', () => {
      api.accessToken = makeToken(300);
      expect(api.isTokenExpiringSoon()).toBe(false);
    });

    it('returns true for token expiring in 30 seconds', () => {
      api.accessToken = makeToken(30);
      expect(api.isTokenExpiringSoon()).toBe(true);
    });

    it('returns true for already expired token', () => {
      api.accessToken = makeToken(-10);
      expect(api.isTokenExpiringSoon()).toBe(true);
    });

    it('returns false for malformed token', () => {
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
    it('returns fresh data on first call', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ songs: [] }));
      api.setTokens(makeToken(300));

      const data = await api.cachedRequest('/songs/workspace/abc');
      expect(data).toEqual({ songs: [] });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns cached data on subsequent calls within TTL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ songs: ['a'] }));
      api.setTokens(makeToken(300));

      await api.cachedRequest('/songs/workspace/abc');
      const data = await api.cachedRequest('/songs/workspace/abc');

      expect(data).toEqual({ songs: ['a'] });
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    it('fetches fresh data after TTL expires', async () => {
      api.setTokens(makeToken(300));
      mockFetch.mockResolvedValueOnce(mockResponse({ v: 1 }));
      await api.cachedRequest('/test', 100);

      // Manually expire the cache entry
      const entry = api._cache.get('/test');
      entry.timestamp = Date.now() - 200;

      mockFetch.mockResolvedValueOnce(mockResponse({ v: 2 }));
      const data = await api.cachedRequest('/test', 100);
      expect(data).toEqual({ v: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateCache', () => {
    it('clears all cache when pattern is null', () => {
      api._cache.set('/a', { data: 1, timestamp: Date.now() });
      api._cache.set('/b', { data: 2, timestamp: Date.now() });
      api.invalidateCache(null);
      expect(api._cache.size).toBe(0);
    });

    it('clears matching entries by pattern', () => {
      api._cache.set('/songs/workspace/abc', { data: 1, timestamp: Date.now() });
      api._cache.set('/gigs/workspace/abc', { data: 2, timestamp: Date.now() });
      api.invalidateCache('/songs');
      expect(api._cache.has('/songs/workspace/abc')).toBe(false);
      expect(api._cache.has('/gigs/workspace/abc')).toBe(true);
    });

    it('is triggered by POST requests', async () => {
      api._cache.set('/songs/workspace/abc', { data: 'old', timestamp: Date.now() });
      api.setTokens(makeToken(300));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'new-song' }));

      await api.request('/songs/workspace/abc', {
        method: 'POST',
        body: JSON.stringify({ title: 'New' }),
      });

      expect(api._cache.has('/songs/workspace/abc')).toBe(false);
    });

    it('is not triggered by GET requests', async () => {
      api._cache.set('/songs/workspace/abc', { data: 'cached', timestamp: Date.now() });
      api.setTokens(makeToken(300));
      mockFetch.mockResolvedValueOnce(mockResponse({ result: 'data' }));

      await api.request('/other/endpoint');

      expect(api._cache.has('/songs/workspace/abc')).toBe(true);
    });
  });
});

// ───────────────────────────────────────────────────
// Request / Response
// ───────────────────────────────────────────────────

describe('Request handling', () => {
  it('includes Authorization header when token exists', async () => {
    api.setTokens('my-token');
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('does not include Authorization header when no token', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it('includes credentials: include for cookies', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('sets Content-Type to application/json', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders['Content-Type']).toBe('application/json');
  });
});

describe('Response handling', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ message: 'hello' }));
    api.setTokens(makeToken(300));

    const data = await api.request('/test');
    expect(data).toEqual({ message: 'hello' });
  });

  it('throws with error message from server on failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Workspace not found' }, 404));
    api.setTokens(makeToken(300));

    await expect(api.request('/test')).rejects.toThrow('Workspace not found');
  });

  it('throws generic message when no error in response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));
    api.setTokens(makeToken(300));

    await expect(api.request('/test')).rejects.toThrow('Request failed');
  });

  it('throws Network error on TypeError (fetch failure)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    api.setTokens(makeToken(300));

    await expect(api.request('/test')).rejects.toThrow('Network error');
  });
});

// ───────────────────────────────────────────────────
// Token Refresh
// ───────────────────────────────────────────────────

describe('Token refresh', () => {
  it('refreshes token on 401 and retries request', async () => {
    api.setTokens(makeToken(300), 'refresh-token');

    // First call returns 401
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, 401));
    // Refresh call succeeds
    mockFetch.mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new-refresh' }));
    // Retry succeeds
    mockFetch.mockResolvedValueOnce(mockResponse({ data: 'success' }));

    const result = await api.request('/protected');
    expect(result).toEqual({ data: 'success' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws session expired when refresh fails with 401', async () => {
    api.setTokens(makeToken(300), 'old-refresh');

    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, 401));
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid refresh token' }, 401));

    await expect(api.request('/protected')).rejects.toThrow('Session expired');
  });

  it('does not clear tokens on 500 during refresh', async () => {
    api.setTokens(makeToken(300), 'refresh-token');

    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, 401));
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500));

    try {
      await api.request('/protected');
    } catch {
      // Expected
    }
    // Tokens should still be in memory (server error is transient)
    expect(api._hasSession).toBe(true);
  });

  it('proactively refreshes before expiry', async () => {
    // Token expiring in 30 seconds (within 60s threshold)
    api.setTokens(makeToken(30), 'refresh-token');

    // Refresh succeeds
    mockFetch.mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new-refresh' }));
    // Actual request succeeds
    mockFetch.mockResolvedValueOnce(mockResponse({ data: 'ok' }));

    const result = await api.request('/test');
    expect(result).toEqual({ data: 'ok' });
    // Should have called refresh + actual request
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent refresh attempts', async () => {
    api.setTokens(makeToken(30), 'refresh-token');

    // One refresh call
    mockFetch.mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new' }));
    // Two actual requests
    mockFetch.mockResolvedValueOnce(mockResponse({ a: 1 }));
    mockFetch.mockResolvedValueOnce(mockResponse({ b: 2 }));

    const [r1, r2] = await Promise.all([
      api.request('/a'),
      api.request('/b'),
    ]);

    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    // Only 1 refresh call, not 2
    const refreshCalls = mockFetch.mock.calls.filter(c => c[0].includes('/auth/refresh'));
    expect(refreshCalls.length).toBe(1);
  });

  it('sends refresh token in body for cross-origin fallback', async () => {
    api.setTokens(makeToken(30), 'my-refresh-token');

    mockFetch.mockResolvedValueOnce(mockResponse({ accessToken: makeToken(300), refreshToken: 'new' }));
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.request('/test');

    const refreshCall = mockFetch.mock.calls.find(c => c[0].includes('/auth/refresh'));
    const body = JSON.parse(refreshCall[1].body);
    expect(body.refreshToken).toBe('my-refresh-token');
  });
});

// ───────────────────────────────────────────────────
// Auth Methods (login, signup, logout)
// ───────────────────────────────────────────────────

describe('Auth methods', () => {
  it('login stores tokens and returns data', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ accessToken: 'at', refreshToken: 'rt', user: { id: '1' } })
    );

    const result = await api.login('test@example.com', 'password');
    expect(result.user).toEqual({ id: '1' });
    expect(api.accessToken).toBe('at');
    expect(api._refreshToken).toBe('rt');
  });

  it('signup stores tokens and returns data', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ accessToken: 'at', refreshToken: 'rt', user: { id: '2' } })
    );

    const result = await api.signup('new@example.com', 'Password1', 'New User');
    expect(result.user).toEqual({ id: '2' });
    expect(api.accessToken).toBe('at');
  });

  it('logout clears tokens', async () => {
    api.setTokens('at', 'rt');
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    await api.logout();
    expect(api.accessToken).toBeNull();
    expect(api._hasSession).toBe(false);
  });
});
