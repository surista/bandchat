/**
 * Per-group channel sort mode. Three options per Simon's request:
 *   ASC    — A→Z (default, matches pre-feature behavior)
 *   DESC   — Z→A
 *   CUSTOM — by Channel.position, then alphabetical as tiebreaker.
 *            Currently positions are mostly 0 (drag-to-reorder within a
 *            group isn't implemented yet); CUSTOM will become meaningful
 *            once that ships. Until then it effectively matches ASC.
 *
 * Synced via userPreferences at `sidebar.<workspaceId>.groupSorts`. Legacy
 * per-device storage at `channelGroupSorts:<workspaceId>` is still read as
 * a fallback so existing users don't lose settings during the migration.
 */

import { storage } from '../services/storage';
import userPreferences from '../services/userPreferences';

export const SORT_MODES = ['ASC', 'DESC', 'CUSTOM'];

export const SORT_LABELS = {
  ASC: 'Alphabetical (A → Z)',
  DESC: 'Alphabetical (Z → A)',
  CUSTOM: 'Custom order',
};

function legacyKey(workspaceId) {
  return `channelGroupSorts:${workspaceId}`;
}

function prefPath(workspaceId) {
  return `sidebar.${workspaceId}.groupSorts`;
}

export function getAllGroupSorts(workspaceId) {
  const fromPrefs = userPreferences.get(prefPath(workspaceId));
  if (fromPrefs && typeof fromPrefs === 'object' && !Array.isArray(fromPrefs)) return fromPrefs;
  const legacy = storage.getJSON(legacyKey(workspaceId), {});
  return legacy && typeof legacy === 'object' ? legacy : {};
}

export function getGroupSort(workspaceId, groupId) {
  const map = getAllGroupSorts(workspaceId);
  return map[groupId] || 'ASC';
}

export function setGroupSort(workspaceId, groupId, mode) {
  if (!SORT_MODES.includes(mode)) return;
  const current = getAllGroupSorts(workspaceId);
  const next = { ...current, [groupId]: mode };
  storage.setJSON(legacyKey(workspaceId), next);
  userPreferences.set(prefPath(workspaceId), next);
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
    out.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}
