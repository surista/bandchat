const { buildMentionRegex, buildChannelRegex, buildGroupMentionRegex, containsGroupMention, GROUP_MENTIONS } = require('../parseMentions');

describe('buildMentionRegex', () => {
  const members = [
    { user: { displayName: 'Alice' } },
    { user: { displayName: 'Bob' } },
    { user: { displayName: 'Simon Lucas' } },
  ];

  test('returns regex that matches @mentions', () => {
    const regex = buildMentionRegex(members);
    expect(regex).not.toBeNull();
    expect('@Alice hello').toMatch(regex);
  });

  test('matches longer names first', () => {
    const overlap = [
      { user: { displayName: 'Simon' } },
      { user: { displayName: 'Simon Lucas' } },
    ];
    const regex = buildMentionRegex(overlap);
    const matches = [...' @Simon Lucas is here'.matchAll(regex)];
    expect(matches[0][2]).toBe('Simon Lucas');
  });

  test('does not match email addresses', () => {
    const regex = buildMentionRegex(members);
    expect('user@Alice.com'.match(regex)).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(buildMentionRegex([])).toBeNull();
  });

  test('returns null for members without displayName', () => {
    expect(buildMentionRegex([{ user: {} }, { user: null }])).toBeNull();
  });

  test('handles displayName directly on member', () => {
    const direct = [{ displayName: 'Charlie' }];
    const regex = buildMentionRegex(direct);
    expect('@Charlie').toMatch(regex);
  });

  test('deduplicates names', () => {
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

  test('returns regex that matches #channel references', () => {
    const regex = buildChannelRegex(channels);
    expect(regex).not.toBeNull();
    expect('#general ').toMatch(regex);
  });

  test('matches longer names first', () => {
    const regex = buildChannelRegex(channels);
    const matches = [...' #general-chat is great'.matchAll(regex)];
    expect(matches[0][2]).toBe('general-chat');
  });

  test('returns null for empty array', () => {
    expect(buildChannelRegex([])).toBeNull();
  });
});

describe('group mentions', () => {
  test('exposes the canonical names', () => {
    expect(GROUP_MENTIONS).toEqual(['channel', 'here', 'everyone']);
  });

  test('detects @channel/@here/@everyone (case-insensitive)', () => {
    expect(containsGroupMention('hey @channel meeting at 4')).toBe(true);
    expect(containsGroupMention('@here please ack')).toBe(true);
    expect(containsGroupMention('@EVERYONE party time')).toBe(true);
    expect(containsGroupMention('hello @Alice')).toBe(false);
    expect(containsGroupMention('email me at user@channel.com')).toBe(false);
  });

  test('does not match partial words', () => {
    expect(containsGroupMention('@channels new vibes')).toBe(false);
    expect(containsGroupMention('@everyoneishere')).toBe(false);
  });

  test('handles empty/null input safely', () => {
    expect(containsGroupMention('')).toBe(false);
    expect(containsGroupMention(null)).toBe(false);
    expect(containsGroupMention(undefined)).toBe(false);
  });

  test('returns a fresh regex each call (lastIndex reset)', () => {
    const r1 = buildGroupMentionRegex();
    const r2 = buildGroupMentionRegex();
    expect(r1).not.toBe(r2);
    expect(r1.test('@here')).toBe(true);
    expect(r2.test('@here')).toBe(true);
  });
});
