/**
 * Escapes HTML special characters to prevent XSS when injecting into HTML strings.
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
export const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
