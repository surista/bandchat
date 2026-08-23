jest.mock('date-fns', () => ({
  format: jest.fn(() => 'Saturday, 21-Mar-2026'),
}));

const { buildSetlistHTML } = require('../buildSetlistHTML');

describe('buildSetlistHTML', () => {
  const items = [
    { type: 'SONG', song: { title: 'Song One', artist: 'Artist A', key: 'Am', bpm: 120, duration: 210 } },
    { type: 'MC', label: 'Intro', duration: 30 },
    { type: 'SONG', song: { title: 'Song Two', artist: 'Artist B', key: 'C', bpm: 140, duration: 180 } },
    { type: 'SET_BREAK', label: 'Intermission' },
    { type: 'SONG', song: { title: 'Song Three', artist: 'Artist C', duration: 240 } },
  ];

  test('returns HTML string', () => {
    const html = buildSetlistHTML('Test Setlist', items);
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('includes setlist name in title and header', () => {
    const html = buildSetlistHTML('My Gig Setlist', items);
    expect(html).toContain('My Gig Setlist');
  });

  test('includes song titles', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('Song One');
    expect(html).toContain('Song Two');
    expect(html).toContain('Song Three');
  });

  test('includes artist names', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('Artist A');
    expect(html).toContain('Artist B');
  });

  test('includes song metadata (key, bpm)', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('Am');
    expect(html).toContain('120');
  });

  test('includes set breaks', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('Intermission');
    expect(html).toContain('set-break');
  });

  test('includes MC sections', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('Intro');
    expect(html).toContain('mc-label');
  });

  test('includes song count in footer', () => {
    const html = buildSetlistHTML('Test', items);
    expect(html).toContain('3 songs');
  });

  test('includes venue logo when provided', () => {
    const html = buildSetlistHTML('Test', items, { venueLogoUrl: 'https://example.com/logo.png' });
    expect(html).toContain('venue-logo');
    expect(html).toContain('https://example.com/logo.png');
  });

  test('omits venue logo element when not provided', () => {
    const html = buildSetlistHTML('Test', items);
    // The CSS class definition exists, but no img element is rendered
    expect(html).not.toContain('<img');
  });

  test('escapes HTML in song titles', () => {
    const xssItems = [
      { type: 'SONG', song: { title: '<script>alert(1)</script>', artist: 'Test', duration: 100 } },
    ];
    const html = buildSetlistHTML('Test', xssItems);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('handles empty items array', () => {
    const html = buildSetlistHTML('Empty', []);
    expect(html).toContain('0 songs');
  });

  // Personal notes are per-user annotations, fetched by the print handler from
  // api.getMySetlistNotes(). Matches web's export.
  test('renders a personal note under its song', () => {
    const html = buildSetlistHTML('Test', [
      { id: 'a', type: 'SONG', song: { title: 'Opener', duration: 200 } },
    ], { notes: { a: { content: 'capo 2' } } });
    expect(html).toContain('<span class="note">capo 2</span>');
  });

  test('renders a personal note under an MC row', () => {
    const html = buildSetlistHTML('Test', [
      { id: 'm', type: 'MC', label: 'Intro' },
    ], { notes: { m: { content: 'thank the sound guy' } } });
    expect(html).toContain('thank the sound guy');
  });

  test('escapes note content', () => {
    const html = buildSetlistHTML('Test', [
      { id: 'a', type: 'SONG', song: { title: 'Opener', duration: 200 } },
    ], { notes: { a: { content: '<img src=x onerror=1>' } } });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  test('omits the note markup entirely when there is no note', () => {
    const html = buildSetlistHTML('Test', [
      { id: 'a', type: 'SONG', song: { title: 'Opener', duration: 200 } },
    ], { notes: { a: { content: '   ' } } });
    expect(html).not.toContain('class="note"');
  });

  test('numbers songs correctly across set breaks', () => {
    const html = buildSetlistHTML('Test', items);
    // After set break, numbering resets to 1
    // Song 1, Song 2 in first set, then Song 1 (renumbered) in second set
    const matches = html.match(/class="num">/g);
    expect(matches).toHaveLength(3);
  });
});
