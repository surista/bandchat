import { describe, it, expect } from 'vitest';
import { buildSetlistHtml } from '../setlistExport';

const songs = (n, title = 'Song Title') => Array.from({ length: n }, (_, i) => ({
  id: `s${i}`,
  type: 'SONG',
  song: { title: `${title} ${i}`, duration: 210 },
}));

// The printed size is solved for, not fixed, so assert on the size the builder
// lands on rather than on markup.
const fontSize = (html) => Number(html.match(/\.song-list \{[^}]*font-size: (\d+)px/)[1]);

describe('buildSetlistHtml — type fitting', () => {
  it('uses the largest size when a short set has room to spare', () => {
    expect(fontSize(buildSetlistHtml({ name: 'S', songs: songs(8) }, {}))).toBe(36);
  });

  it('shrinks as the set gets longer so it stays on one page', () => {
    const short = fontSize(buildSetlistHtml({ name: 'S', songs: songs(12) }, {}));
    const long = fontSize(buildSetlistHtml({ name: 'S', songs: songs(30) }, {}));
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThanOrEqual(13);
  });

  it('never goes below the 13px floor', () => {
    expect(fontSize(buildSetlistHtml({ name: 'S', songs: songs(200) }, {}))).toBe(13);
  });

  it('caps on the longest song title so titles never wrap', () => {
    const shortTitles = fontSize(buildSetlistHtml({ name: 'S', songs: songs(4, 'Hey') }, {}));
    const longTitles = fontSize(buildSetlistHtml(
      { name: 'S', songs: songs(4, 'A Considerably Longer Song Title Than That One') },
      {},
    ));
    expect(longTitles).toBeLessThan(shortTitles);
  });

  // Regression: notes were briefly folded into the width cap, which let one
  // long personal note dictate the size of every title on the page — a roomy
  // 8-song sheet fell from 36px to the 13px floor at the server's 500-char
  // note limit. Notes wrap harmlessly, so they are charged height instead.
  it('does not shrink the type when a set has vertical room, however long the note', () => {
    const setlist = { name: 'S', songs: songs(8) };
    const bare = fontSize(buildSetlistHtml(setlist, {}));
    const noted = fontSize(buildSetlistHtml(setlist, {
      notes: { s1: { content: 'x'.repeat(500) } },
    }));
    expect(noted).toBe(bare);
  });

  it('charges a long note height, not the whole page its type size', () => {
    const setlist = { name: 'S', songs: songs(20) };
    const bare = fontSize(buildSetlistHtml(setlist, {}));
    const noted = fontSize(buildSetlistHtml(setlist, {
      notes: { s1: { content: 'x'.repeat(500) } },
    }));
    expect(noted).toBeLessThan(bare);
    // A few px, not the 15+ the width cap used to cost.
    expect(bare - noted).toBeLessThanOrEqual(6);
  });

  it('gives a single unnamed set the height a set header would have taken', () => {
    // No SET_BREAK means no rendered header, so nothing should be reserved
    // for one.
    const single = fontSize(buildSetlistHtml({ name: 'S', songs: songs(20) }, {}));
    const withBreak = fontSize(buildSetlistHtml({
      name: 'S',
      songs: [{ id: 'b', type: 'SET_BREAK', label: 'Set 1', duration: 0 }, ...songs(20)],
    }, {}));
    expect(single).toBeGreaterThan(withBreak);
  });
});

describe('buildSetlistHtml — content', () => {
  it('escapes song titles, MC labels and notes', () => {
    const html = buildSetlistHtml({
      name: '<script>x</script>',
      songs: [
        { id: 'a', type: 'SONG', song: { title: '<img src=x>' } },
        { id: 'b', type: 'MC', label: '"><b>' },
      ],
    }, { notes: { a: { content: "<i>note</i>" } } });
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<i>note</i>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('keeps the setlist name out of the body for print but includes it for Word', () => {
    const setlist = { name: 'Friday Night', songs: songs(3) };
    expect(buildSetlistHtml(setlist, {})).not.toContain('Friday Night &bull;');
    expect(buildSetlistHtml(setlist, { showName: true })).toContain('Friday Night &bull;');
  });

  it('agrees between the header time range and the last printed set time', () => {
    const html = buildSetlistHtml({
      name: 'S',
      startTime: '20:00',
      songs: [
        ...songs(6),
        { id: 'br', type: 'SET_BREAK', label: 'Set 2', duration: 900 },
        ...songs(6).map((s, i) => ({ ...s, id: `t${i}` })),
      ],
    }, {});
    const setTimes = [...html.matchAll(/<span class="set-time">[^–]+– ([^<]+)<\/span>/g)];
    const headerEnd = html.match(/<span class="time-range">[^–]+– ([^<]+)<\/span>/)[1];
    expect(setTimes.length).toBeGreaterThan(0);
    expect(headerEnd.trim()).toBe(setTimes[setTimes.length - 1][1].trim());
  });

  it('renders MC rows and notes', () => {
    const html = buildSetlistHtml({
      name: 'S',
      songs: [
        { id: 'a', type: 'SONG', song: { title: 'Opener' } },
        { id: 'b', type: 'MC', label: 'Thank the venue' },
      ],
    }, { notes: { a: { content: 'capo 2' } } });
    expect(html).toContain('&lt;Thank the venue&gt;');
    expect(html).toContain('<div class="note">capo 2</div>');
  });

  it('uses short names when asked', () => {
    const setlist = {
      name: 'S',
      songs: [{ id: 'a', type: 'SONG', song: { title: 'The Long Title', shortName: 'Long' } }],
    };
    expect(buildSetlistHtml(setlist, { useShortNames: true })).toContain('>Long<');
    expect(buildSetlistHtml(setlist, { useShortNames: false })).toContain('>The Long Title<');
  });

  it('injects the print script only when asked', () => {
    const setlist = { name: 'S', songs: songs(2) };
    expect(buildSetlistHtml(setlist, { autoPrint: true })).toContain('window.print()');
    expect(buildSetlistHtml(setlist, {})).not.toContain('window.print()');
  });

  it('survives an empty setlist', () => {
    expect(() => buildSetlistHtml({ name: 'S', songs: [] }, {})).not.toThrow();
  });
});
