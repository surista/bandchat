/**
 * Safe localStorage wrapper.
 *
 * Why: every direct localStorage call is a potential exception (Safari private
 * mode throws QuotaExceededError on setItem; reads can return corrupted JSON
 * from old versions or extensions). Each unwrapped throw would propagate up
 * to React and blank the screen. This wrapper swallows errors, falls back to
 * defaults, and never throws.
 *
 * Auth tokens still go through api.js directly — see that file for the
 * accessToken/refreshToken policy.
 *
 * Usage:
 *   import { storage } from '../services/storage';
 *   const width = storage.getNumber('sidebarWidth', 256);
 *   storage.setJSON(`splitRight:${workspaceId}`, value);
 */

function safeGet(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { return false; }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch { return false; }
}

export const storage = {
  /** Raw string read. Returns `fallback` if key missing or storage unavailable. */
  getString(key, fallback = null) {
    const v = safeGet(key);
    return v === null ? fallback : v;
  },

  /** Raw string write. Returns true on success. */
  setString(key, value) {
    return safeSet(key, value);
  },

  /** Number read with parseFloat. Returns `fallback` if invalid. */
  getNumber(key, fallback = 0) {
    const v = safeGet(key);
    if (v === null) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  },

  /** Number write (stored as string). */
  setNumber(key, value) {
    return safeSet(key, String(value));
  },

  /** Boolean read. Stored values are "1"/"0". */
  getBool(key, fallback = false) {
    const v = safeGet(key);
    if (v === null) return fallback;
    return v === '1' || v === 'true';
  },

  setBool(key, value) {
    return safeSet(key, value ? '1' : '0');
  },

  /** JSON read. Returns `fallback` if missing, corrupted, or storage unavailable. */
  getJSON(key, fallback = null) {
    const v = safeGet(key);
    if (v === null) return fallback;
    try { return JSON.parse(v); }
    catch { return fallback; }
  },

  /** JSON write. Returns true on success. */
  setJSON(key, value) {
    try { return safeSet(key, JSON.stringify(value)); }
    catch { return false; }
  },

  /** Delete the key (no-op if missing or storage unavailable). */
  remove(key) {
    return safeRemove(key);
  },

  /** Returns true if localStorage is usable (false in Safari private mode etc.). */
  isAvailable() {
    try {
      const k = '__bc_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
};
