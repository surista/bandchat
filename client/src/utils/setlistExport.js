/**
 * Setlist export — Print (PDF via browser) and Word (.doc download).
 *
 * One HTML builder, two output mechanisms. The HTML is what determines
 * the layout — both Print and Word render the same document. Word opens
 * the .doc transparently because of the application/msword content type
 * + UTF-8 BOM at the front of the blob (this is the standard "HTML-as-Word"
 * trick — avoids pulling in a 100KB+ docx library for a static document).
 *
 * Per-user personal notes (`opts.notes`, keyed by setlistSongId) appear as
 * small italic lines under their song. The notes are loaded from the API
 * by the caller — this utility just renders what it's given.
 */

import { format } from 'date-fns';
import { escapeHtml } from './escapeHtml';
import { computeSetlistDuration, computeSetDuration, formatSetlistDuration } from './setlistDuration';

// Bounds for the print-preview font-size stepper (opts.fontSizeOverride).
// MIN matches the auto-fit floor below; MAX is a sanity ceiling, not tied to
// auto-fit's own cap — see the comment at baseFont for why override may
// deliberately exceed it.
export const MIN_FONT_SIZE = 13;
export const MAX_FONT_SIZE = 60;

function formatTime12h(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function addMinsToTime(time24, minutes) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const totalMins = Math.round(h * 60 + m + minutes);
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function roundUpTo5(time24) {
  if (!time24) return '';
  const [rh, rm] = time24.split(':').map(Number);
  const rounded = Math.ceil(rm / 5) * 5;
  const nh = (rh + Math.floor(rounded / 60)) % 24;
  const nm = rounded % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function splitIntoSets(items) {
  const sets = [];
  let currentSet = { breakItem: null, items: [] };
  for (const item of items) {
    if (item.type === 'SET_BREAK') {
      if (currentSet.items.length > 0 || currentSet.breakItem) sets.push(currentSet);
      currentSet = { breakItem: item, items: [] };
    } else {
      currentSet.items.push(item);
    }
  }
  if (currentSet.items.length > 0 || currentSet.breakItem) sets.push(currentSet);
  return sets;
}


function getSongName(song, useShortNames) {
  if (useShortNames && song?.shortName) return song.shortName;
  return song?.title || 'Unknown';
}

/**
 * Render the document HTML.
 *
 * @param {object} setlist - { name, venue, performedAt, startTime, useShortNames?, songs }
 * @param {object} opts
 * @param {string} [opts.bandName]
 * @param {string} [opts.venueLogoUrl]
 * @param {Object<string,{content:string}>} [opts.notes] - per-setlistSongId
 * @param {number} [opts.transitionPaddingSecs]
 * @param {boolean} [opts.useShortNames] - override setlist.useShortNames
 * @param {boolean} [opts.autoPrint] - inject window.print() (Print mode only)
 * @param {number} [opts.fontSizeOverride] - replace the auto-fit song size,
 *   clamped to [MIN_FONT_SIZE, MAX_FONT_SIZE]. Used by the print-preview
 *   modal's +/- stepper; omit to use the auto-fit size.
 */
export function buildSetlistHtml(setlist, opts = {}) {
  const {
    bandName = '',
    venueLogoUrl = null,
    notes = {},
    transitionPaddingSecs = 0,
    autoPrint = false,
    showName = false,
    fontSizeOverride = null,
  } = opts;
  const useShortNames = opts.useShortNames ?? setlist.useShortNames ?? false;

  const items = setlist.songs || [];
  const sets = splitIntoSets(items);
  const numSets = sets.length;
  const isLandscape = numSets >= 2;

  const songCount = items.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
  const { actualSecs, paddedSecs, paddingSecs } = computeSetlistDuration(items, transitionPaddingSecs);
  const actualLabel = formatSetlistDuration(actualSecs);
  const paddedLabel = formatSetlistDuration(paddedSecs);
  const hasPadding = paddingSecs > 0 && paddedSecs !== actualSecs;

  const dateStr = setlist.performedAt
    ? format(new Date(setlist.performedAt), 'EEEE, dd-MMM-yyyy')
    : format(new Date(), 'EEEE, dd-MMM-yyyy');

  // Per-set timings if a start time is provided. Mirrors SetlistBuilder.jsx's
  // setTimings so the printed sheet agrees with what the band saw in the app:
  // raw actual durations (no per-song rounding) plus the workspace transition
  // padding between songs, via the same computeSetDuration() helper.
  let setTimings = null;
  if (setlist.startTime) {
    setTimings = [];
    let curTime = setlist.startTime;
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const isFinalSet = i === sets.length - 1;
      if (s.breakItem && i > 0) {
        curTime = addMinsToTime(curTime, (s.breakItem.duration || 0) / 60);
      }
      const { paddedSecs: setPaddedSecs } = computeSetDuration(s.items, { isFinalSet, paddingSecs: transitionPaddingSecs });
      const actualStart = i > 0 ? roundUpTo5(curTime) : curTime;
      const setEnd = addMinsToTime(actualStart, setPaddedSecs / 60);
      setTimings.push({ start: actualStart, end: setEnd });
      curTime = setEnd;
    }
  }

  // When per-set timings are printed, the header range has to agree with them.
  const lastSetEnd = setTimings?.[setTimings.length - 1]?.end;
  const overallEndTime = setlist.startTime
    ? (lastSetEnd || addMinsToTime(setlist.startTime, paddedSecs / 60))
    : '';
  const timeRangeStr = setlist.startTime && overallEndTime
    ? `${formatTime12h(setlist.startTime)} – ${formatTime12h(overallEndTime)}`
    : '';

  const setLabelFor = (set, i) => (set.breakItem
    ? (set.breakItem.label || `Set ${i + 1}`)
    : (numSets > 1 ? `Set ${i + 1}` : ''));
  const setTimeFor = (i) => (setTimings?.[i]
    ? `${formatTime12h(setTimings[i].start)} – ${formatTime12h(setTimings[i].end)}`
    : '');

  const columnsHtml = sets.map((set, setIndex) => {
    const setLabel = escapeHtml(setLabelFor(set, setIndex));
    const timeText = setTimeFor(setIndex);
    const setTimeStr = timeText
      ? ` <span class="set-time">${timeText}</span>`
      : '';

    let itemsHtml = '';
    set.items.forEach(item => {
      const note = notes[item.id]?.content?.trim();
      const noteHtml = note ? `<div class="note">${escapeHtml(note)}</div>` : '';
      if (item.type === 'MC') {
        itemsHtml += `<li class="mc-item">&lt;${escapeHtml(item.label) || 'MC'}&gt;${noteHtml}</li>`;
      } else {
        const songName = escapeHtml(getSongName(item.song, useShortNames));
        itemsHtml += `<li class="song-item">${songName}${noteHtml}</li>`;
      }
    });

    return `
      <div class="set-column">
        <div class="set-inner">
          ${setLabel ? `<div class="set-header">${setLabel}${setTimeStr}</div>` : ''}
          <ul class="song-list">${itemsHtml}</ul>
        </div>
      </div>
    `;
  }).join('');

  const setlistInner = `<div class="columns columns-${numSets}">${columnsHtml}</div>`;

  // Type size is computed to fill the page rather than fixed, because the two
  // things asked of this document fight each other: "make it bigger, I read it
  // off the floor" and "stop wasting space / don't spill onto page 2". A fixed
  // size can only satisfy one — too small for a short set, or a page break in a
  // long one. So we solve for the largest size whose tallest column still fits.
  //
  // Landscape once there are two or more sets.
  //
  // Usable height is the page minus header, footer and margins. `@page` pins
  // orientation and margin but NOT a paper size, so the same document prints on
  // A4 in Europe and US Letter in the States — budget for whichever is smaller
  // in the dimension that binds, or the fit is a lie on half the world's
  // printers. At 10mm margins: portrait content height is 277mm on A4 vs 259mm
  // on Letter (Letter binds → 979px, less ~97px of header/footer chrome), while
  // landscape content height is 190mm on A4 vs 196mm on Letter (A4 binds →
  // 718px, less ~98px). Landscape is short enough that Letter is the roomier of
  // the two, which is why only the portrait number moves.
  const usableHeight = isLandscape ? 620 : 880;
  // 979 is the landscape content width on US Letter (259mm at 10mm margins),
  // narrower than A4 landscape's 277mm/1047px — same reasoning as usableHeight
  // above, and here it is Letter that binds.
  const columnWidth = numSets === 1 ? 500
    : numSets === 2 ? 380
    : Math.floor((979 - 16 * (numSets - 1)) / numSets);

  // How many lines a run of text takes in a column, at a given size. ~0.52em is
  // the average character width for this font stack; `emScale` is the row's own
  // font-size multiplier from the CSS below (songs 1em, MC 0.55em, notes 0.5em).
  const lineCount = (chars, emScale, font) =>
    Math.max(1, Math.ceil((0.52 * emScale * font * chars) / columnWidth));

  // Only song titles get a hard width cap. Titles are the thing the document
  // exists to show, and a wrapped title reads as a layout error, so we shrink
  // rather than wrap them.
  //
  // MC labels and personal notes are NOT capped this way, deliberately. They
  // are secondary text that wraps perfectly acceptably, and folding them into
  // the width cap makes one long note dictate the size of every title on the
  // page: at the server's 500-char note limit it drove a roomy 8-song portrait
  // sheet from 36px down to the 13px floor. They are charged height instead —
  // see columnHeight below — which costs a couple of px rather than twenty.
  const longestTitle = Math.max(
    1,
    ...sets.flatMap(s => s.items.map(it => (
      it.type === 'MC' ? 0 : getSongName(it.song, useShortNames).length
    )))
  );
  const widthLimitedFont = Math.floor(columnWidth / (0.52 * longestTitle));

  // Height of one column at a candidate size. Row model matches the CSS below:
  // a song is 1.25f line-height + 6 padding, an MC line is 0.6f (0.55em at 1.1),
  // a personal note line is 0.65f — each counted per *rendered* line, so text
  // that wraps is charged for what it actually occupies.
  const columnHeight = (set, i, font) => {
    let height = 0;
    let songRows = 0;
    for (const it of set.items) {
      if (it.type === 'MC') {
        // +2 chars for the angle brackets the MC row renders around its label.
        height += lineCount((it.label || 'MC').length + 2, 0.55, font) * 0.6 * font;
      } else {
        songRows++;
        height += 1.25 * font;
      }
      const note = notes[it.id]?.content?.trim();
      if (note) height += lineCount(note.length, 0.5, font) * 0.65 * font;
    }
    // The set header is fixed at 20px regardless of font, so shrinking the type
    // cannot rescue it — if its text is wider than the column it wraps and costs
    // a line the 50px block never budgeted. Measure it: bold uppercase at 20px
    // with 1px tracking runs ~13px/char, the appended time range is 14px
    // (~7px/char) plus its 8px margin. A set with no label renders no header
    // block at all, so it is charged nothing.
    const label = setLabelFor(set, i);
    let header = 0;
    if (label) {
      const timeText = setTimeFor(i);
      const headerPx = label.length * 13 + (timeText ? timeText.length * 7 + 8 : 0);
      header = 50 + (Math.max(1, Math.ceil(headerPx / columnWidth)) - 1) * 24;
    }
    return height + songRows * 6 + header;
  };

  // One size across every column — differing sizes side by side look like a
  // mistake. Wrapping makes height a step function of the size rather than a
  // linear one (a note can jump from one line to two), so solve by walking down
  // from the largest allowed size to the first that fits every column, instead
  // of dividing. At most 24 iterations of cheap arithmetic.
  let autoFont = MIN_FONT_SIZE;
  for (let f = Math.min(36, widthLimitedFont); f >= MIN_FONT_SIZE; f--) {
    if (sets.every((s, i) => columnHeight(s, i, f) <= usableHeight)) {
      autoFont = f;
      break;
    }
  }

  // A caller (the print-preview modal) can override the auto-fit size so the
  // user can bump it up for readability, or down to reclaim space — clamped
  // to sane bounds, but deliberately allowed to exceed the auto-fit ceiling:
  // that ceiling exists to avoid a second page, which is a tradeoff the user
  // gets to make deliberately once they can see the preview, not one we make
  // silently for them.
  const baseFont = fontSizeOverride != null
    ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(fontSizeOverride)))
    : autoFont;

  // Header is a single line: band • venue • date • time. It used to be five
  // stacked rows (logo, band, rule, venue, setlist name, date/time) which ate
  // the top third of the page — on a floor-read setlist that space belongs to
  // the songs. The setlist name is dropped here rather than shown twice: the
  // browser already prints it in the page header, from <title>.
  const headerParts = [
    bandName ? `<span class="band-name">${escapeHtml(bandName)}</span>` : '',
    setlist.venue ? `<span class="venue">${escapeHtml(setlist.venue)}</span>` : '',
    `<span class="date">${dateStr}</span>`,
    timeRangeStr ? `<span class="time-range">${timeRangeStr}</span>` : '',
  ].filter(Boolean);

  // The setlist name is deliberately absent from the header — see above — but
  // the Print rationale (the browser prints <title> in the page header) does
  // not carry to the Word export, where <title> is document metadata and never
  // renders in the body. `showName` puts it back for that path only, inline in
  // the footer so it costs no height the fit model would have to account for.
  const namePrefix = showName && setlist.name
    ? `${escapeHtml(setlist.name)} &bull; `
    : '';
  const statsLine = hasPadding
    ? `${namePrefix}${songCount} songs &bull; ${actualLabel} songs only &bull; ${paddedLabel} with ${paddingSecs}s gaps`
    : `${namePrefix}${songCount} songs &bull; ${actualLabel} total`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(setlist.name)} - Setlist</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { ${isLandscape ? 'size: landscape;' : ''} margin: 10mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      margin: 0 auto;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    /* Single-line header. flex-wrap is a safety valve: a very long band +
       venue pair on a narrow portrait page wraps rather than overflowing. */
    .header {
      display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center;
      gap: 0 10px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 3px solid #222;
    }
    .header > span { white-space: nowrap; }
    .venue-logo { width: 28px; height: 28px; object-fit: contain; border-radius: 4px; align-self: center; }
    .band-name { font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
    .venue { font-size: 19px; font-weight: 600; }
    .date { font-size: 15px; color: #555; }
    .sep { color: #bbb; font-size: 15px; }
    .time-range { color: #0891b2; font-weight: 500; font-size: 15px; }
    .content { flex: 1; display: flex; align-items: stretch; }
    .columns { display: flex; gap: 16px; width: 100%; height: 100%; }
    .columns-1 { max-width: 500px; margin: 0 auto; text-align: center; }
    .set-column { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
    /* Inner block holds the header + song list. align-items:center on the
       column centers this block within the column's half of the page; the
       block keeps its own text left-aligned. */
    .set-inner { width: 100%; flex: 1; display: flex; flex-direction: column; }
    /* Two sets: each half is wide (~480px), so cap the block at 380px and let
       align-items:center put even gutters on both sides. A fixed width keeps
       the two halves visually symmetric. */
    .columns-2 .set-inner { max-width: 380px; text-align: left; }
    /* Three or four sets: each column is narrower (~316px / ~232px), so a fixed
       380px cap would exceed the column and leave nothing to center. Use
       fit-content instead — the block shrinks to its widest line (usually the
       SET header + time range) and centers in its third/quarter, with the song
       text left-aligned. No magic pixel value, and long titles never wrap. */
    .columns-3 .set-inner,
    .columns-4 .set-inner { width: fit-content; max-width: 100%; text-align: left; }
    .set-header {
      font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;
      margin: 0 0 12px 0; padding: 8px 0; border-bottom: 2px solid #333;
    }
    .set-time { font-size: 14px; font-weight: normal; color: #0891b2; margin-left: 8px; text-transform: none; letter-spacing: 0; }
    /* Song size is set once per column-count on the list, and the items size
       themselves in em off it — so the MC ratio holds at every layout.
       Bigger than before throughout: this gets read off the floor mid-set. */
    .song-list { list-style: none; padding: 0; flex: 1; font-size: ${baseFont}px; }
    .song-item { padding: 3px 0; font-size: 1em; line-height: 1.25; }
    /* MC rows are markers between songs, not entries to read at a glance, so
       they get a fraction of the height. The list previously used
       justify-content: space-evenly, which handed every <li> an equal share of
       the column regardless of its content — a one-word MC line occupied as
       much page as a song title. Normal flow lets the shorter row be shorter. */
    .mc-item { padding: 0; font-style: italic; font-size: 0.55em; line-height: 1.1; color: #666; }
    /* em, so personal notes track whatever size their song row ended up at. */
    .note {
      display: block;
      font-size: 0.5em;
      font-style: italic;
      color: #555;
      margin-top: 2px;
      font-weight: normal;
      text-transform: none;
      letter-spacing: normal;
      line-height: 1.3;
    }
    .footer { margin-top: 14px; padding-top: 10px; border-top: 3px solid #222; text-align: center; }
    .stats { font-size: 12px; color: #666; }
    @media print {
      body { padding: 0; }
      .set-header { break-inside: avoid; }
      .song-item, .mc-item { break-inside: avoid; }
    }
  </style>
</head>
<body data-base-font="${baseFont}" data-auto-font="${autoFont}" data-orientation="${isLandscape ? 'landscape' : 'portrait'}">
  <div class="header">
    ${venueLogoUrl ? `<img src="${escapeHtml(venueLogoUrl)}" class="venue-logo" alt="" />` : ''}
    ${headerParts.join('<span class="sep">&bull;</span>')}
  </div>
  <div class="content">${setlistInner}</div>
  <div class="footer">
    <div class="stats">${statsLine}</div>
  </div>
  ${autoPrint ? '<script>window.onload = function() { window.print(); };</script>' : ''}
</body>
</html>`;
}

/**
 * Open a printable popup with the setlist HTML. Browser save-as-PDF
 * then yields a PDF. Returns `{ ok, error? }` so the caller can show
 * a toast if popups are blocked.
 */
export function printSetlist(setlist, opts = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return { ok: false, error: 'popup-blocked' };
  const html = buildSetlistHtml(setlist, { ...opts, autoPrint: true });
  printWindow.document.write(html);
  printWindow.document.close();
  return { ok: true };
}

/**
 * Trigger a .doc download. Word opens it natively via the
 * application/msword content type. No external library required.
 */
export function exportSetlistAsWord(setlist, opts = {}) {
  const html = buildSetlistHtml(setlist, { ...opts, autoPrint: false, showName: true });
  // Leading BOM lets Word interpret the file as UTF-8 HTML.
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const safeName = (setlist.name || 'setlist').replace(/[^\w\s.-]/g, '_').trim() || 'setlist';
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}
