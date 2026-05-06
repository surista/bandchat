import { describe, it, expect } from 'vitest';
import { buildMentionRegex, buildChannelRegex, buildGroupMentionRegex, containsGroupMention, GROUP_MENTIONS } from '../parseMentions';

describe('buildMentionRegex', () => {
  const members = [
    { user: { displayName: 'Alice' } },
    { user: { displayName: 'Bob' } },
    { user: { displayName: 'Simon Lucas' } },
  ];

  it('returns regex that matches @mentions', () => {
    const regex = buildMentionRegex(members);
    expect(regex).not.toBeNull();
    expect('@Alice hello').toMatch(regex);
  });

  it('matches longer names before shorter prefixes', () => {
    const membersWithOverlap = [
      { user: { displayName: 'Simon' } },
      { user: { displayName: 'Simon Lucas' } },
    ];
    const regex = buildMentionRegex(membersWithOverlap);
    const matches = [...' @Simon Lucas is here'.matchAll(regex)];
    expect(matches[0][2]).toBe('Simon Lucas');
  });

  it('matches mention at start of string', () => {
    const regex = buildMentionRegex(members);
    expect('@Bob test').toMatch(regex);
  });

  it('matches mention after whitespace', () => {
    const regex = buildMentionRegex(members);
    expect('hey @Alice').toMatch(regex);
  });

  it('does not match email addresses', () => {
    const regex = buildMentionRegex(members);
    // email has word char before @, should not match
    expect('user@Alice.com'.match(regex)).toBeNull();
  });

  it('returns null for empty members', () => {
    expect(buildMentionRegex([])).toBeNull();
  });

  it('returns null for members without displayName', () => {
    expect(buildMentionRegex([{ user: {} }, { user: null }])).toBeNull();
  });

  it('handles members with displayName directly (no user wrapper)', () => {
    const direct = [{ displayName: 'Charlie' }];
    const regex = buildMentionRegex(direct);
    expect('@Charlie').toMatch(regex);
  });

  it('handles special regex characters in names', () => {
    const special = [{ user: { displayName: 'O\'Brien (Jr.)' } }];
    const regex = buildMentionRegex(special);
    expect(regex).not.toBeNull();
    // Should not throw when constructed
  });

  it('deduplicates names', () => {
    const dupes = [
      { user: { displayName: 'Alice' } },
      { user: { displayName: 'Alice' } },
    ];
    const regex = buildMentionRegex(dupes);
    expect(regex).not.toBeNull();
  });
});

describe('buildChannelRegex', () => {
  const channels = [
    { name: 'general' },
    { name: 'general-chat' },
    { name: 'music' },
  ];

  it('returns regex that matches #channel references', () => {
    const regex = buildChannelRegex(channels);
    expect(regex).not.toBeNull();
    expect('#general ').toMatch(regex);
  });

  it('matches longer names before shorter ones', () => {
    const regex = buildChannelRegex(channels);
    const matches = [...' #general-chat is great'.matchAll(regex)];
    expect(matches[0][2]).toBe('general-chat');
  });

  it('matches at start of string', () => {
    const regex = buildChannelRegex(channels);
    expect('#music is fun').toMatch(regex);
  });

  it('matches before punctuation', () => {
    const regex = buildChannelRegex(channels);
    expect('check #general.').toMatch(regex);
  });

  it('matches at end of string', () => {
    const regex = buildChannelRegex(channels);
    expect('see #music').toMatch(regex);
  });

  it('returns null for empty channels', () => {
    expect(buildChannelRegex([])).toBeNull();
  });

  it('returns null for channels without names', () => {
    expect(buildChannelRegex([{}, { name: null }])).toBeNull();
  });
});

describe('group mentions', () => {
  it('exposes the canonical names', () => {
    expect(GROUP_MENTIONS).toEqual(['channel', 'here', 'everyone']);
  });

  it('detects @channel/@here/@everyone (case-insensitive)', () => {
    expect(containsGroupMention('hey @channel meeting at 4')).toBe(true);
    expect(containsGroupMention('@here please ack')).toBe(true);
    expect(containsGroupMention('@EVERYONE party time')).toBe(true);
    expect(containsGroupMention('hello @Alice')).toBe(false);
    expect(containsGroupMention('email me at user@channel.com')).toBe(false);
  });

  it('does not match partial words', () => {
    // @channels (plural) and @everyones must NOT trigger broadcast
    expect(containsGroupMention('@channels new vibes')).toBe(false);
    expect(containsGroupMention('@everyoneishere')).toBe(false);
  });

  it('handles empty/null input safely', () => {
    expect(containsGroupMention('')).toBe(false);
    expect(containsGroupMention(null)).toBe(false);
    expect(containsGroupMention(undefined)).toBe(false);
  });

  it('returns a fresh regex each call (lastIndex reset)', () => {
    const r1 = buildGroupMentionRegex();
    const r2 = buildGroupMentionRegex();
    expect(r1).not.toBe(r2);
    // Each instance should match independently
    expect(r1.test('@here')).toBe(true);
    expect(r2.test('@here')).toBe(true);
  });
});
