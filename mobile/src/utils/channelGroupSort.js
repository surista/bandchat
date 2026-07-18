/**
 * Per-group channel sort mode (mobile mirror of client/src/utils/channelGroupSort.js).
 *
 *   ASC    — A→Z (default, matches pre-feature behavior)
 *   DESC   — Z→A
 *   CUSTOM — by Channel.position then alphabetical. Until drag-to-reorder
 *            within a group is implemented, CUSTOM effectively matches ASC
 *            because positions are mostly 0.
 *
 * Synced via userPreferences at `sidebar.<workspaceId>.groupSorts`. Legacy
 * per-device storage at `channelGroupSorts:<workspaceId>` is still read as
 * a fallback so users don't lose their settings during the migration.
 */

import { getUiState, setUiState } from '../services/storage';
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

export async function getAllGroupSorts(workspaceId) {
  const fromPrefs = userPreferences.get(prefPath(workspaceId));
  if (fromPrefs && typeof fromPrefs === 'object') return fromPrefs;
  const legacy = await getUiState(legacyKey(workspaceId));
  return legacy && typeof legacy === 'object' ? legacy : {};
}

export async function setGroupSort(workspaceId, groupId, mode) {
  if (!SORT_MODES.includes(mode)) return;
  const current = await getAllGroupSorts(workspaceId);
  const next = { ...current, [groupId]: mode };
  await setUiState(legacyKey(workspaceId), next);
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
