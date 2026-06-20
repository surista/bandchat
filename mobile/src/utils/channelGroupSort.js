/**
 * Per-group channel sort mode (mobile mirror of client/src/utils/channelGroupSort.js).
 *
 *   ASC    — A→Z (default, matches pre-feature behavior)
 *   DESC   — Z→A
 *   CUSTOM — by Channel.position then alphabetical. Until drag-to-reorder
 *            within a group is implemented, CUSTOM effectively matches ASC
 *            because positions are mostly 0.
 *
 * Stored per-device under `channelGroupSorts:<workspaceId>` via
 * services/storage's getUiState/setUiState wrappers. Personal preference,
 * no server sync — keep this in sync with the web copy.
 */

import { getUiState, setUiState } from '../services/storage';

export const SORT_MODES = ['ASC', 'DESC', 'CUSTOM'];

export const SORT_LABELS = {
  ASC: 'Alphabetical (A → Z)',
  DESC: 'Alphabetical (Z → A)',
  CUSTOM: 'Custom order',
};

function storageKey(workspaceId) {
  return `channelGroupSorts:${workspaceId}`;
}

export async function getAllGroupSorts(workspaceId) {
  const map = await getUiState(storageKey(workspaceId));
  return map && typeof map === 'object' ? map : {};
}

export async function setGroupSort(workspaceId, groupId, mode) {
  if (!SORT_MODES.includes(mode)) return;
  const map = (await getUiState(storageKey(workspaceId))) || {};
  map[groupId] = mode;
  await setUiState(storageKey(workspaceId), map);
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
