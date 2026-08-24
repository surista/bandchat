/**
 * Synced user preferences (mobile).
 *
 * Server-backed via /api/me/preferences. Local cache mirrors what the server
 * has so reads are synchronous and offline-tolerant. Writes update local
 * cache immediately (optimistic) and PUT to the server with a 500ms debounce.
 * The server broadcasts `preferences:updated` on socket; we apply remote
 * patches into the local cache.
 *
 * Mirror of client/src/services/userPreferences.js — keep in sync.
 * See user-preferences-sync-plan.md at repo root.
 *
 * Hardening (v1.07.28):
 * - Value-equality guard in `set()` kills no-op writes (also fixes the
 *   "remote patch arrives → state set → write-effect echoes patch back"
 *   ping-pong loop with other devices).
 * - Epoch counter cancels in-flight PUTs across logout/login boundaries
 *   so Alice's pending patch can't land on Bob's account.
 * - AppState 'background' listener flushes pending patches synchronously.
 * - JSON serialized synchronously before async AsyncStorage write so rapid
 *   `set()` calls can't race into a torn local cache.
 * - Path-prefix subscribe filter (`subscribe(fn, pathPrefix?)`) lets
 *   consumers ignore irrelevant emits.
 */

import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { getUiState, setUiState } from './storage';
import api from './api';

const LOCAL_CACHE_KEY = 'userPreferences:cache';
const MIGRATED_FLAG_KEY = 'userPreferences:migrated:v1';
const DEBOUNCE_MS = 500;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

let _prefs = {};
let _loaded = false;
// Subscribers: { fn, pathPrefix? } — fn fires only when emitted path starts
// with pathPrefix (or always, when pathPrefix is undefined/empty).
const _subscribers = new Set();
let _pendingPatch = {};
let _debounceTimer = null;
// In-flight PUTs are tagged with the epoch at the time they started.
// `clear()` (logout) bumps the epoch; any flush still in flight aborts
// on completion. Prevents Alice's pending patch landing on Bob's account.
let _epoch = 0;
// Track AppState listener so we can clean it up if the singleton is reset.
let _appStateSub = null;

function _emitChange(path) {
  for (const sub of _subscribers) {
    if (!sub.pathPrefix || path === '' || path.startsWith(sub.pathPrefix)) {
      try { sub.fn(path); } catch { /* listener errors must not break others */ }
    }
  }
}

function getPath(obj, path, fallback) {
  if (!path) return obj;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function setPathPatch(path, value) {
  const parts = path.split('.');
  const out = {};
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

function deepMergeInto(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === null) {
      delete target[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// Combine a new patch into the queued OUTGOING patch (_pendingPatch). This is
// distinct from deepMergeInto: applying a patch to real state (_prefs) means
// `null` should delete the key, but accumulating multiple patches into one
// outgoing PUT must keep `null` as a literal value — otherwise a delete queued
// against a key the accumulator doesn't have yet (the common case) silently
// vanishes before it ever reaches the server.
function accumulatePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === null) {
      target[key] = null;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      accumulatePatch(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// Persist the local cache via the mandated storage wrapper. setUiState
// stringifies its `value` argument SYNCHRONOUSLY (before the AsyncStorage
// write suspends), so passing _prefs directly still captures the current
// snapshot immediately — back-to-back set() calls can't torn-write it.
function _persistLocalCache() {
  setUiState(LOCAL_CACHE_KEY, _prefs).catch(() => {});
}

function _flushDebounced() {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  const patch = _pendingPatch;
  _pendingPatch = {};
  if (Object.keys(patch).length === 0) return;

  // Capture the epoch we started in. If clear() (logout) fires before the
  // PUT completes, the response is discarded — and crucially, we never
  // re-queue the patch after a logout boundary.
  const startEpoch = _epoch;
  api.request('/me/preferences', {
    method: 'PUT',
    body: JSON.stringify({ patch }),
  }).catch((err) => {
    if (startEpoch !== _epoch) return; // logout happened — drop silently
    // A definitive auth failure (dead/revoked refresh token) already cleared
    // api's session inside request() — there is no session left to write
    // against. Without this check the retry below re-arms every DEBOUNCE_MS
    // forever: confirmed in production hammering the server indefinitely from
    // a single client with a dead session (every retry throws the same 401,
    // since accessToken is now null too). Drop the patch instead — nothing to
    // sync until a real login happens, at which point clear()+load() rebuild
    // state from the server from scratch anyway.
    if (!api.accessToken) return;
    // Real network/server failure: keep the patch in _pendingPatch so it
    // retries automatically, and re-arm the debounce so it actually fires
    // again instead of waiting on some unrelated future set() call.
    accumulatePatch(_pendingPatch, patch);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_flushDebounced, DEBOUNCE_MS);
    if (__DEV__) console.warn('[prefs] PUT failed, will retry on next set:', err?.message);
  });
}

function _registerAppStateListener() {
  if (_appStateSub) return;
  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      _flushDebounced();
    }
  });
}

const userPreferences = {
  /**
   * Hydrate from local cache (instant) and then server (authoritative).
   * Run auto-migration the first time we see an empty server blob and have
   * local legacy values. Call once after auth completes.
   */
  async load(legacyMigrate) {
    _registerAppStateListener();
    // Local cache first so reads after load() never block.
    try {
      const cached = await getUiState(LOCAL_CACHE_KEY);
      if (cached && typeof cached === 'object') {
        _prefs = cached;
        _loaded = true;
        _emitChange('');
      }
    } catch {}

    const loadEpoch = _epoch;
    try {
      const { preferences } = await api.request('/me/preferences');
      if (loadEpoch !== _epoch) return; // logout during load — abandon
      _prefs = preferences || {};
      _loaded = true;
      _persistLocalCache();
      _emitChange('');

      const alreadyMigrated = await getUiState(MIGRATED_FLAG_KEY, false);
      if (loadEpoch !== _epoch) return;
      const serverIsEmpty = Object.keys(_prefs).length === 0;
      if (!alreadyMigrated && serverIsEmpty && typeof legacyMigrate === 'function') {
        const patch = await legacyMigrate();
        if (loadEpoch !== _epoch) return;
        if (patch && typeof patch === 'object' && Object.keys(patch).length > 0) {
          deepMergeInto(_prefs, patch);
          _persistLocalCache();
          _emitChange('');
          api.request('/me/preferences', {
            method: 'PUT',
            body: JSON.stringify({ patch }),
          }).catch(() => {});
        }
        await setUiState(MIGRATED_FLAG_KEY, true);
      }
    } catch (err) {
      if (__DEV__) console.warn('[prefs] load failed:', err?.message);
    }
  },

  get(path, fallback) {
    return getPath(_prefs, path, fallback);
  },

  set(path, value) {
    // Value-equality guard. Skipping no-op writes prevents the ping-pong
    // loop where a remote patch updates state → state effect calls set()
    // → server PUT → echo → state update again. It also stops the boot-time
    // "save the values we just loaded" noise.
    if (deepEqual(getPath(_prefs, path), value)) return;

    const patch = setPathPatch(path, value);
    deepMergeInto(_prefs, patch);
    _persistLocalCache();
    accumulatePatch(_pendingPatch, patch);
    _emitChange(path);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_flushDebounced, DEBOUNCE_MS);
  },

  /**
   * Apply a server-pushed patch (from socket). The set() value-equality
   * guard means our own echoes harmlessly no-op without needing a separate
   * dedupe table — but we still guard the patch shape here.
   */
  applyRemotePatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    if (Object.keys(patch).length === 0) return;
    // Snapshot before merge so we can skip the emit when nothing changed
    // (e.g. the server echoing back our own PUT). Prevents subscribers from
    // re-rendering for no-op updates such as self-sent patches.
    const before = JSON.stringify(_prefs);
    deepMergeInto(_prefs, patch);
    if (JSON.stringify(_prefs) === before) return;
    _persistLocalCache();
    _emitChange('');
  },

  /**
   * Reset on logout. Bumps the epoch so any in-flight PUT or load is
   * abandoned on completion. Clears in-memory state + local cache.
   *
   * Deliberately does NOT reset MIGRATED_FLAG_KEY. That flag means "this
   * device has already run its one-time legacy migration" — a per-device
   * fact, not a per-user one. Resetting it on logout would let a second user
   * who logs into this device inherit the first user's local legacy storage
   * values (theme, blocked domains, etc.) via auto-migration.
   */
  async clear() {
    _epoch++;
    _prefs = {};
    _loaded = false;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    _pendingPatch = {};
    try {
      await setUiState(LOCAL_CACHE_KEY, {});
    } catch {}
    _emitChange('');
  },

  isLoaded() { return _loaded; },

  /** Force-flush any pending patch immediately (e.g. before sensitive nav). */
  flush() { _flushDebounced(); },

  /**
   * Subscribe to changes. If `pathPrefix` is provided, the callback only
   * fires for emits whose path starts with that prefix (or for whole-tree
   * emits where path is ''). Returns unsubscribe.
   */
  subscribe(fn, pathPrefix) {
    const sub = { fn, pathPrefix };
    _subscribers.add(sub);
    return () => _subscribers.delete(sub);
  },
};

/**
 * React hook for re-rendering when a preference path changes. Captures
 * `fallback` via a ref so callers passing an inline literal (`useUserPreference('x', {})`)
 * don't tear down/re-add the subscriber on every render.
 */
export function useUserPreference(path, fallback) {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [value, setValue] = useState(() => userPreferences.get(path, fallback));
  useEffect(() => {
    const reread = () => {
      const next = userPreferences.get(path, fallbackRef.current);
      setValue((prev) => deepEqual(prev, next) ? prev : next);
    };
    const unsub = userPreferences.subscribe(reread, path);
    reread();
    return unsub;
  }, [path]);
  return value;
}

export default userPreferences;
