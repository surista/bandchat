import { format } from 'date-fns';
import { formatDuration } from './formatDuration';
import { computeSetlistDuration, formatSetlistDuration } from './setlistDuration';

/**
 * Builds an HTML string for a setlist PDF/print export.
 * @param {string} setlistName - The name of the setlist
 * @param {Array} items - The setlist items array
 * @param {Object} options - Optional configuration
 * @param {string} options.date - Date string for the header
 * @param {string} options.venueLogoUrl - URL for venue logo image
 * @returns {string} HTML string
 */
export function buildSetlistHTML(setlistName, items, options = {}) {
  const date = options.date || format(new Date(), 'EEEE, dd-MMM-yyyy');
  const venueLogoUrl = options.venueLogoUrl || null;
  const paddingSecs = typeof options.transitionPaddingSecs === 'number' ? options.transitionPaddingSecs : 15;

  const songItems = items.filter(i => i.type === 'SONG' || (!i.type && i.song));
  const totalSongs = songItems.length;
  const { actualSecs, paddedSecs } = computeSetlistDuration(items, paddingSecs);
  const totalActualLabel = formatSetlistDuration(actualSecs);
  const totalPaddedLabel = formatSetlistDuration(paddedSecs);
  const totalSummary = actualSecs === paddedSecs
    ? totalActualLabel
    : `${totalActualLabel} songs only &bull; ${totalPaddedLabel} w/ ${paddingSecs}s gaps`;

  let songNumber = 0;
  let rowsHtml = '';

  for (const item of items) {
    if (item.type === 'SET_BREAK') {
      rowsHtml += `
        <tr class="set-break">
          <td colspan="6">${escapeHtml(item.label || 'Set Break')}</td>
        </tr>`;
      songNumber = 0;
      continue;
    }

    if (item.type === 'MC') {
      rowsHtml += `
        <tr class="mc-row">
          <td></td>
          <td colspan="5" class="mc-label">${escapeHtml(item.label || 'MC')}${item.duration ? ' (' + formatDuration(item.duration) + ')' : ''}</td>
        </tr>`;
      continue;
    }

    songNumber++;
    const song = item.song || {};
    rowsHtml += `
      <tr>
        <td class="num">${songNumber}</td>
        <td class="title">${escapeHtml(song.title || 'Unknown')}</td>
        <td class="artist">${escapeHtml(song.artist || '')}</td>
        <td class="key">${escapeHtml(song.key || '')}</td>
        <td class="bpm">${song.bpm || ''}</td>
        <td class="duration">${song.duration ? formatDuration(song.duration) : ''}</td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(setlistName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      padding: 24px;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #222;
    }
    .venue-logo {
      width: 70px;
      height: 70px;
      object-fit: contain;
      margin: 0 auto 8px;
      border-radius: 8px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .header .date {
      font-size: 13px;
      color: #666;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 2px solid #333;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
    }
    td {
      padding: 7px 6px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 14px;
    }
    .num { width: 30px; text-align: center; color: #888; }
    .title { font-weight: 600; }
    .artist { color: #555; }
    .key { text-align: center; width: 70px; }
    .bpm { text-align: center; width: 50px; }
    .duration { text-align: right; width: 50px; color: #888; }
    .set-break td {
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #666;
      padding: 14px 6px;
      border-bottom: 2px solid #333;
      border-top: 2px solid #333;
      background: #f5f5f5;
    }
    .mc-row .mc-label {
      font-style: italic;
      color: #888;
    }
    .footer {
      text-align: center;
      padding-top: 12px;
      border-top: 2px solid #222;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    ${venueLogoUrl ? `<img src="${escapeHtml(venueLogoUrl)}" class="venue-logo" alt="" />` : ''}
    <h1>${escapeHtml(setlistName)}</h1>
    <div class="date">${escapeHtml(date)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Title</th>
        <th>Artist</th>
        <th>Key</th>
        <th>BPM</th>
        <th style="text-align:right">Time</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="footer">
    ${totalSongs} songs &bull; ${totalSummary}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
