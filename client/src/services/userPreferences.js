/**
 * Synced user preferences (web).
 *
 * Mirror of mobile/src/services/userPreferences.js — keep in sync. See
 * user-preferences-sync-plan.md at repo root for the design.
 *
 * Hardening (v1.07.28):
 * - Value-equality guard in `set()` kills no-op writes (also fixes the
 *   "remote patch arrives → state set → write-effect echoes patch back"
 *   ping-pong loop with other devices).
 * - Epoch counter cancels in-flight PUTs across logout/login boundaries
 *   so Alice's pending patch can't land on Bob's account.
 * - `beforeunload` + `pagehide` flush so the last change before tab close
 *   isn't lost (then overwritten by the next session's load).
 * - Path-prefix subscribe filter lets consumers ignore irrelevant emits.
 */

import { useEffect, useState, useRef } from 'react';
import { storage } from './storage';
import api from './api';

const LOCAL_CACHE_KEY = 'userPreferences:cache';
const MIGRATED_FLAG_KEY = 'userPreferences:migrated:v1';
const DEBOUNCE_MS = 500;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

let _prefs = {};
let _loaded = false;
const _subscribers = new Set();
let _pendingPatch = {};
let _debounceTimer = null;
let _epoch = 0;
let _unloadListenerAttached = false;

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

function _flushDebounced() {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  const patch = _pendingPatch;
  _pendingPatch = {};
  if (Object.keys(patch).length === 0) return;

  const startEpoch = _epoch;
  api.request('/me/preferences', {
    method: 'PUT',
    body: JSON.stringify({ patch }),
  }).catch((err) => {
    if (startEpoch !== _epoch) return;
    accumulatePatch(_pendingPatch, patch);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_flushDebounced, DEBOUNCE_MS);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[prefs] PUT failed, will retry on next set:', err?.message);
    }
  });
}

function _flushSyncOnUnload() {
  // pagehide/beforeunload only allows synchronous work. `keepalive: true`
  // tells the browser to keep the fetch alive even after the page is gone.
  if (Object.keys(_pendingPatch).length === 0 && !_debounceTimer) return;
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  const patch = _pendingPatch;
  _pendingPatch = {};
  if (Object.keys(patch).length === 0) return;

  // api.request has async token-refresh logic that the browser kills during
  // unload. Go direct to fetch via api.keepalivePut so the patch ships even
  // when the tab is closing (browser keeps keepalive fetches alive post-unload).
  api.keepalivePut('/me/preferences', JSON.stringify({ patch }));
}

function _attachUnloadListener() {
  if (_unloadListenerAttached) return;
  if (typeof window === 'undefined') return;
  _unloadListenerAttached = true;
  // `pagehide` fires more reliably than `beforeunload` on mobile Safari and
  // when the tab is being put in bfcache.
  window.addEventListener('pagehide', _flushSyncOnUnload);
  window.addEventListener('beforeunload', _flushSyncOnUnload);
}

const userPreferences = {
  async load(legacyMigrate) {
    _attachUnloadListener();
    try {
      const cached = storage.getJSON(LOCAL_CACHE_KEY, {});
      if (cached && typeof cached === 'object') {
        _prefs = cached;
        _loaded = true;
        _emitChange('');
      }
    } catch {}

    const loadEpoch = _epoch;
    try {
      const { preferences } = await api.request('/me/preferences');
      if (loadEpoch !== _epoch) return;
      _prefs = preferences || {};
      _loaded = true;
      storage.setJSON(LOCAL_CACHE_KEY, _prefs);
      _emitChange('');

      const alreadyMigrated = storage.getBool(MIGRATED_FLAG_KEY, false);
      const serverIsEmpty = Object.keys(_prefs).length === 0;
      if (!alreadyMigrated && serverIsEmpty && typeof legacyMigrate === 'function') {
        const patch = await legacyMigrate();
        if (loadEpoch !== _epoch) return;
        if (patch && typeof patch === 'object' && Object.keys(patch).length > 0) {
          deepMergeInto(_prefs, patch);
          storage.setJSON(LOCAL_CACHE_KEY, _prefs);
          _emitChange('');
          api.request('/me/preferences', {
            method: 'PUT',
            body: JSON.stringify({ patch }),
          }).catch(() => {});
        }
        storage.setBool(MIGRATED_FLAG_KEY, true);
      }
    } catch {
      // Local cache covers offline first launch.
    }
  },

  get(path, fallback) {
    return getPath(_prefs, path, fallback);
  },

  set(path, value) {
    if (deepEqual(getPath(_prefs, path), value)) return;
    const patch = setPathPatch(path, value);
    deepMergeInto(_prefs, patch);
    storage.setJSON(LOCAL_CACHE_KEY, _prefs);
    accumulatePatch(_pendingPatch, patch);
    _emitChange(path);
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_flushDebounced, DEBOUNCE_MS);
  },

  applyRemotePatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    if (Object.keys(patch).length === 0) return;
    // Snapshot before merge so we can skip the emit when nothing changed
    // (e.g. the server echoing back our own PUT). This prevents subscribers
    // from re-rendering for no-op updates such as self-sent patches.
    const before = JSON.stringify(_prefs);
    deepMergeInto(_prefs, patch);
    if (JSON.stringify(_prefs) === before) return;
    storage.setJSON(LOCAL_CACHE_KEY, _prefs);
    _emitChange('');
  },

  async clear() {
    _epoch++;
    _prefs = {};
    _loaded = false;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    _pendingPatch = {};
    storage.setJSON(LOCAL_CACHE_KEY, {});
    // Deliberately NOT resetting MIGRATED_FLAG_KEY here. The flag means "this
    // device has already run its one-time legacy migration" — a per-device
    // fact, not a per-user one. Resetting it on logout would let a second
    // user who logs into this device inherit the first user's local legacy
    // storage values (theme, blocked domains, etc.) via auto-migration.
    _emitChange('');
  },

  isLoaded() { return _loaded; },

  flush() { _flushDebounced(); },

  subscribe(fn, pathPrefix) {
    const sub = { fn, pathPrefix };
    _subscribers.add(sub);
    return () => _subscribers.delete(sub);
  },
};

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
