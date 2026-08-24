jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('../api', () => ({
  __esModule: true,
  default: { accessToken: null, request: jest.fn() },
}));

const api = require('../api').default;
const userPreferences = require('../userPreferences').default;

// Helper: create a mock Response-shaped rejection matching what api.request()
// throws on a definitive auth failure vs. a transient server error.
function authDeadError() {
  return Object.assign(new Error('Session expired. Please log in again.'), { type: 'AUTH' });
}
function transientError() {
  return Object.assign(new Error('Internal error'), { type: 'SERVER' });
}

/**
 * Regression coverage for the production "Google login loop" incident
 * (2026-08-24). Mirrors client/src/services/__tests__/userPreferences.retry.test.js
 * — mobile's _flushDebounced had the identical unconditional-retry defect.
 */
describe('userPreferences (mobile) — dead-session retry guard', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();
    api.accessToken = null;
    api.request.mockReset();
    await userPreferences.clear();
  });

  it('does not re-arm the retry loop once the session is dead', async () => {
    api.accessToken = 'access';
    api.request.mockRejectedValue(authDeadError());

    userPreferences.set('theme.mode', 'dark');
    // A real definitive auth failure clears api.accessToken inside
    // request() before it rejects — simulate that here since api.request is
    // mocked out rather than exercising the real network/refresh path.
    api.request.mockImplementation(async () => {
      api.accessToken = null;
      throw authDeadError();
    });
    userPreferences.flush();

    await new Promise((r) => setTimeout(r, 50));
    const callsAfterFirstFailure = api.request.mock.calls.length;
    expect(callsAfterFirstFailure).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 1200));

    // A live bug would keep calling request() roughly every DEBOUNCE_MS
    // forever.
    expect(api.request.mock.calls.length).toBe(callsAfterFirstFailure);
  });

  it('still retries on a transient failure with a live session', async () => {
    api.accessToken = 'access';
    let call = 0;
    api.request.mockImplementation(async () => {
      call++;
      if (call === 1) throw transientError();
      return { ok: true };
    });

    userPreferences.set('theme.mode', 'dark');
    userPreferences.flush();

    await new Promise((r) => setTimeout(r, 50));
    expect(api.request).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 700));
    expect(api.request.mock.calls.length).toBeGreaterThan(1);
  });
});
