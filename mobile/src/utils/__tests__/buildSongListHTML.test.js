const { buildSongListHTML } = require('../buildSongListHTML');

describe('buildSongListHTML', () => {
  const songs = [
    { title: 'Song A', artist: 'Artist 1', key: 'Am', bpm: 120, duration: 210 },
    { title: 'Song B', shortName: 'SB', artist: 'Artist 2', key: 'C', bpm: 140, duration: 180 },
    { title: 'Song C', artist: 'Artist 3', duration: 240 },
  ];

  test('returns HTML string', () => {
    const html = buildSongListHTML(songs);
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('includes song titles', () => {
    const html = buildSongListHTML(songs);
    expect(html).toContain('Song A');
    expect(html).toContain('Song B');
    expect(html).toContain('Song C');
  });

  test('includes shortName as aka', () => {
    const html = buildSongListHTML(songs);
    expect(html).toContain('(SB)');
    expect(html).toContain('aka');
  });

  test('includes artist names', () => {
    const html = buildSongListHTML(songs);
    expect(html).toContain('Artist 1');
    expect(html).toContain('Artist 2');
  });

  test('includes song count in footer', () => {
    const html = buildSongListHTML(songs);
    expect(html).toContain('3 songs');
  });

  test('uses singular for 1 song', () => {
    const html = buildSongListHTML([songs[0]]);
    expect(html).toContain('1 song');
    expect(html).not.toContain('1 songs');
  });

  test('includes band name when provided', () => {
    const html = buildSongListHTML(songs, { bandName: 'The Rockers' });
    expect(html).toContain('The Rockers');
    expect(html).toContain('band-name');
  });

  test('omits band name element when not provided', () => {
    const html = buildSongListHTML(songs);
    // The CSS class definition exists, but no band-name element is rendered in the body
    expect(html).not.toContain('<div class="band-name">');
  });

  test('includes search query when provided', () => {
    const html = buildSongListHTML(songs, { searchQuery: 'rock' });
    expect(html).toContain('filtered by');
    expect(html).toContain('rock');
  });

  test('escapes HTML in titles', () => {
    const xss = [{ title: '<img src=x onerror=alert(1)>', artist: 'Test', duration: 100 }];
    const html = buildSongListHTML(xss);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('handles empty array', () => {
    const html = buildSongListHTML([]);
    expect(html).toContain('0 songs');
  });

  test('handles songs without duration', () => {
    const noDuration = [{ title: 'No Duration', artist: 'Test' }];
    const html = buildSongListHTML(noDuration);
    expect(html).toContain('No Duration');
    // Footer should not show total duration
    expect(html).not.toContain('total');
  });
});
