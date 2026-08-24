import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node 22+'s built-in global `localStorage`/`sessionStorage` shadow jsdom's
// working implementation in this test environment and throw without a
// `--localstorage-file` flag ("localStorage.setItem is not a function") —
// unrelated to this suite, but api.js's constructor touches localStorage
// unconditionally (one-time legacy-token cleanup), so any test importing it
// needs a working stub in place first.
function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

const api = (await import('../api')).default;

/**
 * Regression coverage for the production "Google login loop" incident
 * (2026-08-24): a leftover socket reconnecting with an already-superseded
 * refresh token would resolve AFTER a fresh login had set new tokens, and
 * unconditionally clearing tokens on that stale 401 wiped out the newer,
 * valid session. See the comment in api.js's _doRefresh().
 */
describe('ApiService._doRefresh — stale-response guard', () => {
  beforeEach(() => {
    api.clearTokens();
    vi.restoreAllMocks();
  });

  it('does not clobber a session established while an older refresh was in flight', async () => {
    api.setTokens('old-access', 'old-refresh');

    let resolveFetch;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));

    // Zombie refresh starts with the OLD token — simulates a backgrounded
    // socket's connect_error handler firing before a fresh login completes.
    const stalePromise = api.refreshAccessToken();

    // A fresh login (e.g. Google) completes while the zombie request is
    // still in flight, replacing the session with new tokens.
    api.setTokens('new-access', 'new-refresh');

    // The zombie request now resolves — 401, because the server already
    // deleted/rotated the old token out from under it.
    resolveFetch({ ok: false, status: 401, json: async () => ({ error: 'Refresh token has been revoked' }) });
    await stalePromise;

    // The fresh session must survive.
    expect(api.accessToken).toBe('new-access');
    expect(api._refreshToken).toBe('new-refresh');
    expect(api._hasSession).toBe(true);
  });

  it('still clears tokens on a definitive 401 when nothing else has superseded it', async () => {
    api.setTokens('only-access', 'only-refresh');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Refresh token has been revoked' }),
    })));

    const result = await api.refreshAccessToken();

    expect(result).toBe(false);
    expect(api.accessToken).toBeNull();
    expect(api._hasSession).toBe(false);
  });

  it('applies a normal (non-raced) successful refresh', async () => {
    api.setTokens('old-access', 'old-refresh');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
    })));

    const result = await api.refreshAccessToken();

    expect(result).toBe(true);
    expect(api.accessToken).toBe('rotated-access');
    expect(api._refreshToken).toBe('rotated-refresh');
  });

  it('dedupes concurrent callers into a single in-flight request', async () => {
    api.setTokens('old-access', 'old-refresh');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([
      api.refreshAccessToken(),
      api.refreshAccessToken(),
      api.refreshAccessToken(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([true, true, true]);
  });
});
