/**
 * User preferences sync.
 *
 * Backs a single `User.preferences Json` column. Stored as a nested object
 * (e.g. theme.mode, sidebar.<wsId>.collapsedGroups). PUT accepts a partial
 * patch and deep-merges into the current value. The merge is wrapped in a
 * Serializable transaction with retry so two devices changing different
 * keys simultaneously don't lose each other's writes.
 *
 * After a successful PUT, emit `preferences:updated` on the user's room so
 * other connected devices receive the patch in real time. We don't have the
 * originating socket here (HTTP context), so the client dedupes echoes by
 * value-equality (see services/userPreferences.js on both platforms).
 *
 * Hardening (v1.07.28):
 * - Prototype-pollution blocklist on every merge level.
 * - Depth cap (32) on the recursion.
 * - Per-patch byte cap (256KB) AND post-merge stored-size cap (512KB),
 *   both measured in UTF-8 bytes (not UTF-16 code units).
 * - Rejects U+0000 in strings (Postgres jsonb refuses NUL bytes).
 * - Serializable transaction with up to 3 retries to handle the race.
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/apiError.js';

const router = express.Router();

const MAX_PATCH_BYTES = 256 * 1024;
const MAX_STORED_BYTES = 512 * 1024;
const MAX_MERGE_DEPTH = 32;
const TX_RETRIES = 3;
const NUL_CHAR = String.fromCharCode(0);

// Keys that JSON.parse can produce as own properties but must NEVER be merged
// into a real object — they'd pollute the prototype chain and persist to the
// database, then echo to every connected client.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function containsNullByte(value, depth = 0) {
  if (depth > MAX_MERGE_DEPTH) {
    throw new ApiError(400, 'Preferences nesting too deep', { code: 'PREF_TOO_DEEP' });
  }
  if (typeof value === 'string') return value.indexOf(NUL_CHAR) !== -1;
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k.indexOf(NUL_CHAR) !== -1) return true;
    }
    for (const v of Object.values(value)) {
      if (containsNullByte(v, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Deep merge two plain objects. Arrays and primitives in `patch` overwrite
 * the value in `target` outright. `null` in patch deletes the key. Recursion
 * is capped at MAX_MERGE_DEPTH; exceeding it throws so the request 400s
 * rather than blowing the V8 stack.
 */
function deepMerge(target, patch, depth = 0) {
  if (depth > MAX_MERGE_DEPTH) {
    throw new ApiError(400, 'Preferences nesting too deep', { code: 'PREF_TOO_DEEP' });
  }
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const isPlainTarget = target && typeof target === 'object' && !Array.isArray(target);
  const out = isPlainTarget ? { ...target } : {};
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const value = patch[key];
    if (value === null) {
      delete out[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key], value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Run the read-modify-write in a Serializable transaction so concurrent
 * PUTs from the same user can't lose each other's non-overlapping changes.
 * Postgres raises 40001 on serialization failure — retry a few times.
 */
async function mergeWithRetry(userId, patch) {
  for (let attempt = 0; attempt <= TX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const row = await tx.user.findUnique({
          where: { id: userId },
          select: { preferences: true },
        });
        const merged = deepMerge(row?.preferences ?? {}, patch);

        const storedBytes = Buffer.byteLength(JSON.stringify(merged), 'utf8');
        if (storedBytes > MAX_STORED_BYTES) {
          throw new ApiError(413, 'Preferences exceed maximum size', { code: 'PREF_TOO_LARGE' });
        }

        await tx.user.update({
          where: { id: userId },
          data: { preferences: merged },
        });
        return merged;
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      const code = err?.code || err?.meta?.code;
      if (attempt < TX_RETRIES && (code === '40001' || code === 'P2034')) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(500, 'Preferences merge failed');
}

router.get('/preferences', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { preferences: true },
  });
  res.json({ preferences: user?.preferences ?? {} });
}));

router.put('/preferences', authenticate, asyncHandler(async (req, res) => {
  const { patch } = req.body || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, 'patch must be an object', { code: 'PREF_BAD_SHAPE' });
  }

  // Byte cap, not character cap — emoji and other 4-byte UTF-8 chars would
  // sneak past `.length` (which counts UTF-16 code units).
  if (Buffer.byteLength(JSON.stringify(patch), 'utf8') > MAX_PATCH_BYTES) {
    throw new ApiError(413, 'patch too large', { code: 'PREF_PATCH_TOO_LARGE' });
  }

  if (containsNullByte(patch)) {
    throw new ApiError(400, 'NUL bytes are not allowed in preferences', { code: 'PREF_NUL' });
  }

  const merged = await mergeWithRetry(req.user.id, patch);

  try {
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.id}`).emit('preferences:updated', { patch });
    }
  } catch (e) {
    console.warn('Failed to emit preferences:updated:', e?.message);
  }

  res.json({ preferences: merged });
}));

export default router;
