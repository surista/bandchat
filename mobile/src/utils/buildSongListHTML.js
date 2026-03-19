import { formatDuration } from './formatDuration';

/**
 * Builds an HTML string for a song list PDF/print export.
 * @param {Array} songs - The sorted/filtered songs array
 * @param {Object} options - Optional configuration
 * @param {string} options.bandName - Band/workspace name for the header
 * @param {string} options.searchQuery - Active search filter (shown in subtitle)
 * @returns {string} HTML string
 */
export function buildSongListHTML(songs, options = {}) {
  const { bandName, searchQuery } = options;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const totalSeconds = songs.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalDuration = totalSeconds > 0 ? formatDuration(totalSeconds) : null;

  let rowsHtml = '';
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const aka = song.shortName ? ` <span class="aka">(${escapeHtml(song.shortName)})</span>` : '';
    rowsHtml += `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="title">${escapeHtml(song.title || 'Unknown')}${aka}</td>
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
  <title>${escapeHtml(bandName || 'Songs')} - Song List</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 10mm; }
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
      border-bottom: 3px solid #222;
    }
    .band-name {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .header-divider {
      width: 50px;
      height: 3px;
      background: #0891b2;
      margin: 8px auto;
      border-radius: 2px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .header .date {
      font-size: 12px;
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
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
    }
    td {
      padding: 6px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 13px;
    }
    .num { width: 28px; text-align: center; color: #888; }
    .title { font-weight: 600; }
    .aka { font-weight: 400; font-style: italic; color: #888; font-size: 11px; }
    .artist { color: #555; }
    .key { text-align: center; width: 60px; }
    .bpm { text-align: center; width: 45px; }
    .duration { text-align: right; width: 45px; color: #888; }
    .footer {
      text-align: center;
      padding-top: 12px;
      border-top: 3px solid #222;
      font-size: 11px;
      color: #666;
    }
    @media print {
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${bandName ? `<div class="band-name">${escapeHtml(bandName)}</div><div class="header-divider"></div>` : ''}
    <h1>Song List</h1>
    <div class="date">${escapeHtml(date)}${searchQuery ? ` &mdash; filtered by "${escapeHtml(searchQuery)}"` : ''}</div>
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
    ${songs.length} song${songs.length !== 1 ? 's' : ''}${totalDuration ? ` &bull; ${totalDuration} total` : ''}
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
