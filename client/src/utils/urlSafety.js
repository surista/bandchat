/**
 * Validates that a URL uses a safe protocol (http or https).
 * Prevents javascript: protocol XSS when rendering user-provided URLs as links.
 *
 * @param {string} url - The URL to validate
 * @returns {boolean} True if the URL uses http: or https: protocol
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}
