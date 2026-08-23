import { describe, it, expect } from 'vitest';
import {
  MC_DEFAULT_DURATION_SECS,
  DEFAULT_TRANSITION_PADDING_SECS,
  isSongItem,
  getItemActualDuration,
  computeSetlistDuration,
  computeSetDuration,
  formatSetlistDuration,
} from '../setlistDuration';

// This module is mirrored at mobile/src/utils/setlistDuration.js, and the
// server carries the same MC default at server/src/routes/setlists.js. The
// numbers have to agree or the same setlist reports different running times
// on web, on mobile, and in the printed sheet. These tests pin the constants
// so a change to one copy fails loudly rather than drifting silently.
describe('setlistDuration constants', () => {
  it('defaults an MC section to 30s', () => {
    expect(MC_DEFAULT_DURATION_SECS).toBe(30);
  });

  it('defaults transition padding to 15s', () => {
    expect(DEFAULT_TRANSITION_PADDING_SECS).toBe(15);
  });
});

describe('getItemActualDuration', () => {
  it('falls back to the MC default when an MC has no duration', () => {
    expect(getItemActualDuration({ type: 'MC' })).toBe(MC_DEFAULT_DURATION_SECS);
    expect(getItemActualDuration({ type: 'MC', duration: null })).toBe(MC_DEFAULT_DURATION_SECS);
  });

  it('keeps an explicitly stored MC duration', () => {
    // Items saved under the old 60s default are real data, not a default.
    expect(getItemActualDuration({ type: 'MC', duration: 60 })).toBe(60);
  });

  it('does not invent a duration for a set break', () => {
    expect(getItemActualDuration({ type: 'SET_BREAK' })).toBe(0);
    expect(getItemActualDuration({ type: 'SET_BREAK', duration: 600 })).toBe(600);
  });

  it('reads song duration off the nested song', () => {
    expect(getItemActualDuration({ type: 'SONG', song: { duration: 210 } })).toBe(210);
    expect(getItemActualDuration({ type: 'SONG', song: {} })).toBe(0);
  });

  it('returns 0 for a missing item', () => {
    expect(getItemActualDuration(null)).toBe(0);
  });
});

describe('isSongItem', () => {
  it('treats a typeless item with a song as a song', () => {
    expect(isSongItem({ song: { duration: 1 } })).toBe(true);
    expect(isSongItem({ type: 'SONG' })).toBe(true);
    expect(isSongItem({ type: 'MC' })).toBe(false);
    expect(isSongItem(null)).toBe(false);
  });
});

describe('computeSetlistDuration', () => {
  const items = [
    { type: 'SONG', song: { duration: 200 } },
    { type: 'MC' },
    { type: 'SONG', song: { duration: 220 } },
    { type: 'SONG', song: { duration: 180 } },
  ];

  it('sums actual durations including the MC fallback', () => {
    expect(computeSetlistDuration(items).actualSecs).toBe(200 + 30 + 220 + 180);
  });

  it('pads between songs but not after the last one', () => {
    const { paddedSecs, songCount } = computeSetlistDuration(items, 15);
    expect(songCount).toBe(3);
    expect(paddedSecs).toBe(630 + 2 * 15);
  });

  it('honours an explicit zero padding', () => {
    const { paddedSecs, actualSecs } = computeSetlistDuration(items, 0);
    expect(paddedSecs).toBe(actualSecs);
  });

  it('falls back to the default padding for a non-numeric value', () => {
    expect(computeSetlistDuration(items, undefined).paddingSecs).toBe(15);
    expect(computeSetlistDuration(items, 'nope').paddingSecs).toBe(15);
  });

  it('tolerates a non-array', () => {
    expect(computeSetlistDuration(null).actualSecs).toBe(0);
  });
});

describe('computeSetDuration', () => {
  const items = [
    { type: 'SONG', song: { duration: 200 } },
    { type: 'SONG', song: { duration: 220 } },
  ];

  it('pads every song in a non-final set (the last transitions into the break)', () => {
    expect(computeSetDuration(items, { isFinalSet: false, paddingSecs: 15 }).paddedSecs)
      .toBe(420 + 2 * 15);
  });

  it('leaves the very last song of the final set unpadded', () => {
    expect(computeSetDuration(items, { isFinalSet: true, paddingSecs: 15 }).paddedSecs)
      .toBe(420 + 1 * 15);
  });
});

describe('formatSetlistDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatSetlistDuration(185)).toBe('3:05');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatSetlistDuration(3725)).toBe('1:02:05');
  });

  it('clamps negatives and nullish input to 0:00', () => {
    expect(formatSetlistDuration(-5)).toBe('0:00');
    expect(formatSetlistDuration(null)).toBe('0:00');
  });
});
