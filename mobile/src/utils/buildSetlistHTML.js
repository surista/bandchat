import { formatDuration } from './formatDuration';

/**
 * Builds an HTML string for a setlist PDF/print export.
 * @param {string} setlistName - The name of the setlist
 * @param {Array} items - The setlist items array
 * @param {Object} options - Optional configuration
 * @param {string} options.date - Date string for the header
 * @returns {string} HTML string
 */
export function buildSetlistHTML(setlistName, items, options = {}) {
  const date = options.date || new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const songItems = items.filter(i => i.type === 'SONG' || (!i.type && i.song));
  const totalSongs = songItems.length;
  const totalSeconds = items.reduce((sum, i) => sum + (i.song?.duration || i.duration || 0), 0);
  const totalDuration = formatDuration(totalSeconds) || '0:00';

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
    ${totalSongs} songs &bull; ${totalDuration} total
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
