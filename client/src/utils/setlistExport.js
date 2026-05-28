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
import { computeSetlistDuration, formatSetlistDuration } from './setlistDuration';

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

function getItemSecs(item) {
  if (item.type === 'SET_BREAK') return item.duration || 0;
  if (item.type === 'MC') return item.duration || 60;
  const d = item.song?.duration || 0;
  return d > 0 ? Math.ceil(d / 60) * 60 : 0;
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
 */
export function buildSetlistHtml(setlist, opts = {}) {
  const {
    bandName = '',
    venueLogoUrl = null,
    notes = {},
    transitionPaddingSecs = 0,
    autoPrint = false,
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

  // Per-set timings if a start time is provided.
  let setTimings = null;
  if (setlist.startTime) {
    setTimings = [];
    let curTime = setlist.startTime;
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const allItems = s.breakItem ? [s.breakItem, ...s.items] : s.items;
      let setDurSecs = 0;
      for (const it of allItems) {
        if (it.type === 'SET_BREAK' && i > 0) {
          curTime = addMinsToTime(curTime, (it.duration || 0) / 60);
        }
        if (it.type !== 'SET_BREAK') setDurSecs += getItemSecs(it);
      }
      const actualStart = i > 0 ? roundUpTo5(curTime) : curTime;
      const setEnd = addMinsToTime(actualStart, setDurSecs / 60);
      setTimings.push({ start: actualStart, end: setEnd });
      curTime = setEnd;
    }
  }

  const overallEndTime = setlist.startTime ? addMinsToTime(setlist.startTime, paddedSecs / 60) : '';
  const timeRangeStr = setlist.startTime && overallEndTime
    ? `${formatTime12h(setlist.startTime)} – ${formatTime12h(overallEndTime)}`
    : '';

  const columnsHtml = sets.map((set, setIndex) => {
    const setLabel = set.breakItem
      ? (escapeHtml(set.breakItem.label) || `Set ${setIndex + 1}`)
      : (numSets > 1 ? `Set ${setIndex + 1}` : '');
    const setTimeStr = setTimings?.[setIndex]
      ? ` <span class="set-time">${formatTime12h(setTimings[setIndex].start)} – ${formatTime12h(setTimings[setIndex].end)}</span>`
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

  const statsLine = hasPadding
    ? `${songCount} songs &bull; ${actualLabel} songs only &bull; ${paddedLabel} with ${paddingSecs}s gaps`
    : `${songCount} songs &bull; ${actualLabel} total`;

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
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #222; }
    .venue-logo { width: 80px; height: 80px; object-fit: contain; margin: 0 auto 8px; border-radius: 8px; }
    .band-name { font-size: 36px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px; }
    .header-divider { width: 60px; height: 3px; background: #0891b2; margin: 8px auto; border-radius: 2px; }
    .venue { font-size: 24px; font-weight: 600; margin-bottom: 2px; }
    .setlist-name { font-size: 16px; color: #666; }
    .header-details { display: flex; justify-content: center; gap: 18px; margin-top: 6px; font-size: 15px; color: #555; }
    .header-details span { white-space: nowrap; }
    .time-range { color: #0891b2; font-weight: 500; }
    .content { flex: 1; display: flex; align-items: stretch; }
    .columns { display: flex; gap: 16px; width: 100%; height: 100%; }
    .columns-1 { max-width: 500px; margin: 0 auto; text-align: center; }
    .set-column { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
    /* Inner block holds the header + song list. align-items:center on the
       column centers this block within the column's half of the page; the
       block keeps its own text left-aligned. */
    .set-inner { width: 100%; flex: 1; display: flex; flex-direction: column; }
    /* Multi-set: cap each block's width so it's a clearly-centered column with
       gutters on both sides, rather than running flush to the page edge. The
       SET header underline then aligns with the song block, not the half. */
    .columns-2 .set-inner,
    .columns-3 .set-inner,
    .columns-4 .set-inner { max-width: 380px; text-align: left; }
    .set-header {
      font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;
      margin: 0 0 12px 0; padding: 8px 0; border-bottom: 2px solid #333;
    }
    .set-time { font-size: 14px; font-weight: normal; color: #0891b2; margin-left: 8px; text-transform: none; letter-spacing: 0; }
    .song-list { list-style: none; padding: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; }
    .columns-1 .song-item { padding: 4px 0; font-size: 24px; }
    .columns-1 .mc-item { padding: 4px 0; font-style: italic; font-size: 24px; }
    .song-item { padding: 4px 0; font-size: 20px; }
    .mc-item { padding: 4px 0; font-style: italic; font-size: 20px; }
    .note {
      display: block;
      font-size: 12px;
      font-style: italic;
      color: #555;
      margin-top: 2px;
      font-weight: normal;
      text-transform: none;
      letter-spacing: normal;
    }
    .columns-1 .note { font-size: 14px; }
    .footer { margin-top: 14px; padding-top: 10px; border-top: 3px solid #222; text-align: center; }
    .stats { font-size: 12px; color: #666; }
    @media print {
      body { padding: 0; }
      .set-header { break-inside: avoid; }
      .song-item, .mc-item { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${venueLogoUrl ? `<img src="${escapeHtml(venueLogoUrl)}" class="venue-logo" alt="" />` : ''}
    ${bandName ? `<div class="band-name">${escapeHtml(bandName)}</div>` : ''}
    ${bandName && (setlist.venue || setlist.name) ? '<div class="header-divider"></div>' : ''}
    ${setlist.venue ? `<div class="venue">${escapeHtml(setlist.venue)}</div>` : ''}
    <div class="setlist-name">${escapeHtml(setlist.name)}</div>
    <div class="header-details">
      <span>${dateStr}</span>
      ${timeRangeStr ? `<span class="time-range">${timeRangeStr}</span>` : ''}
    </div>
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
  const html = buildSetlistHtml(setlist, { ...opts, autoPrint: false });
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
