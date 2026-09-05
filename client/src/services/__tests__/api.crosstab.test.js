import { describe, it, expect, beforeEach, vi } from 'vitest';

// See api.refresh.test.js for why these stubs are needed in this environment.
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

const { ApiService } = await import('../api');

/**
 * Regression coverage for "forced re-login on every refresh" when BandChat is
 * open in more than one tab. Refresh tokens are single-use with no grace
 * period, but each tab has its own in-memory ApiService instance — without
 * cross-tab sync, whichever tab refreshes first invalidates every other
 * tab's stored token, so their next refresh (including a plain reload) fails
 * with "revoked" and forces a full re-login even though the session is
 * genuinely still valid. Each `new ApiService()` below stands in for one tab.
 */
describe('ApiService — cross-tab auth sync via BroadcastChannel', () => {
  let tabA, tabB;

  beforeEach(() => {
    tabA = new ApiService();
    tabB = new ApiService();
  });

  it('propagates a token rotation from one tab to another', async () => {
    tabA.setTokens('access-1', 'refresh-1');
    tabB.setTokens('access-1', 'refresh-1');

    // Give the (macrotask-based) BroadcastChannel delivery a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(tabB.accessToken).toBe('access-1');

    // tabA refreshes independently and rotates the token.
    tabA.setTokens('access-2', 'refresh-2');
    await new Promise((r) => setTimeout(r, 0));

    // tabB adopts the new token without ever calling the server itself —
    // so its next refresh attempt uses the still-valid current token
    // instead of the one tabA's rotation already invalidated.
    expect(tabB.accessToken).toBe('access-2');
    expect(tabB._refreshToken).toBe('refresh-2');
    expect(tabB._hasSession).toBe(true);
  });

  it('propagates logout to other tabs', async () => {
    tabA.setTokens('access-1', 'refresh-1');
    tabB.setTokens('access-1', 'refresh-1');
    await new Promise((r) => setTimeout(r, 0));

    tabA.clearTokens();
    await new Promise((r) => setTimeout(r, 0));

    expect(tabB.accessToken).toBeNull();
    expect(tabB._refreshToken).toBeNull();
    expect(tabB._hasSession).toBe(false);
  });
});
