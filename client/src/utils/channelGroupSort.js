/**
 * Per-group channel sort mode. Three options per Simon's request:
 *   ASC    — A→Z (default, matches pre-feature behavior)
 *   DESC   — Z→A
 *   CUSTOM — by Channel.position, then alphabetical as tiebreaker.
 *            Currently positions are mostly 0 (drag-to-reorder within a
 *            group isn't implemented yet); CUSTOM will become meaningful
 *            once that ships. Until then it effectively matches ASC.
 *
 * Stored per-device under `channelGroupSorts:<workspaceId>` as a map of
 * { [groupId]: 'ASC' | 'DESC' | 'CUSTOM' }. No server persistence — sort
 * is a per-user preference and persisting it locally avoids API churn.
 */

import { storage } from '../services/storage';

export const SORT_MODES = ['ASC', 'DESC', 'CUSTOM'];

export const SORT_LABELS = {
  ASC: 'Alphabetical (A → Z)',
  DESC: 'Alphabetical (Z → A)',
  CUSTOM: 'Custom order',
};

function storageKey(workspaceId) {
  return `channelGroupSorts:${workspaceId}`;
}

export function getGroupSort(workspaceId, groupId) {
  const map = storage.getJSON(storageKey(workspaceId), {});
  return map && typeof map === 'object' ? (map[groupId] || 'ASC') : 'ASC';
}

export function setGroupSort(workspaceId, groupId, mode) {
  if (!SORT_MODES.includes(mode)) return;
  const map = storage.getJSON(storageKey(workspaceId), {}) || {};
  map[groupId] = mode;
  storage.setJSON(storageKey(workspaceId), map);
}

export function getAllGroupSorts(workspaceId) {
  const map = storage.getJSON(storageKey(workspaceId), {});
  return map && typeof map === 'object' ? map : {};
}

export function sortChannels(channels, mode) {
  const out = [...channels];
  if (mode === 'DESC') {
    out.sort((a, b) => b.name.localeCompare(a.name));
  } else if (mode === 'CUSTOM') {
    out.sort((a, b) => {
      const pa = a.position ?? 0;
      const pb = b.position ?? 0;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  } else {
    // ASC default
    out.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}
