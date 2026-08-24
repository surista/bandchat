import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node 22+'s built-in global `localStorage` shadows jsdom's working
// implementation in this test environment — see api.refresh.test.js for
// detail. userPreferences.js's storage import touches it via `storage.js`,
// which is try/catch-wrapped, but api.js's constructor is not.
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
const userPreferences = (await import('../userPreferences')).default;

/**
 * Regression coverage for the production "Google login loop" incident
 * (2026-08-24). Once a session's tokens were dead, userPreferences'
 * debounced PUT retry re-armed itself on every failure unconditionally,
 * regardless of why it failed — confirmed in production as an indefinite
 * ~1 req/s hammer against the server from a single tab (1065 requests over
 * 15 minutes, every one a doomed 401). See the comment in
 * userPreferences.js's _flushDebounced().
 */
describe('userPreferences — dead-session retry guard', () => {
  beforeEach(() => {
    api.clearTokens();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not re-arm the retry loop once the session is dead', async () => {
    await userPreferences.clear();
    api.setTokens('access', 'refresh');

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Refresh token has been revoked' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    userPreferences.set('theme.mode', 'dark');
    // request() sees the 401, tries to refresh (also 401), clears the
    // session, and rejects — this is the exact path that used to re-arm the
    // debounce timer regardless of what killed the request.
    userPreferences.flush();

    // Give both the failed PUT and its failed refresh-then-retry a moment to
    // settle, then advance past several would-be retry intervals.
    await new Promise((r) => setTimeout(r, 50));
    const callsAfterFirstFailure = fetchMock.mock.calls.length;
    expect(callsAfterFirstFailure).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 1200));

    // A live bug would keep calling fetch roughly every DEBOUNCE_MS forever.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstFailure);
    expect(api._hasSession).toBe(false);
  });

  it('still retries on a transient failure with a live session', async () => {
    await userPreferences.clear();
    api.setTokens('access', 'refresh');

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    userPreferences.set('theme.mode', 'dark');
    userPreferences.flush();

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The retry timer should still be armed — session is alive, failure was
    // transient (500, not a definitive auth rejection).
    await new Promise((r) => setTimeout(r, 700));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
