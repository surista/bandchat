/**
 * Validate that a URL is from an allowed upload domain.
 * Accepts both legacy Cloudinary URLs and new R2 URLs.
 */

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

// Extract hostname for R2 public URL (e.g. 'pub-xxx.r2.dev')
let r2Hostname = '';
try {
  if (R2_PUBLIC_URL) {
    r2Hostname = new URL(R2_PUBLIC_URL).hostname;
  }
} catch {
  // Invalid R2_PUBLIC_URL, ignore
}

/**
 * Check if a URL is from an allowed upload provider.
 * @param {string} urlString - The URL to validate
 * @param {object} options
 * @param {boolean} options.allowGoogle - Also allow googleusercontent.com (for avatars)
 * @returns {{ valid: boolean, error?: string }}
 */
export function isAllowedUploadUrl(urlString, { allowGoogle = false } = {}) {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS' };
    }

    const hostname = url.hostname;
    const allowed =
      hostname.endsWith('cloudinary.com') ||
      (r2Hostname && hostname === r2Hostname) ||
      (allowGoogle && hostname.endsWith('googleusercontent.com'));

    if (!allowed) {
      return { valid: false, error: 'URL must be from an allowed upload provider' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}

export default isAllowedUploadUrl;
