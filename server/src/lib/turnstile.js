// ---------------------------------------------------------------------------
// Cloudflare Turnstile verification helper
// ---------------------------------------------------------------------------
// Protects signup from scripted/bot account creation. Verification is a
// no-op (returns true) when TURNSTILE_SECRET_KEY isn't set, so signup keeps
// working on environments that haven't configured Turnstile yet -- it only
// starts enforcing once the key is actually present, never silently blocking
// signup over a missing config value.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isTurnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Verify a Turnstile token submitted by the client.
 * @param {string} token - The token from the client-side widget.
 * @param {string} [remoteIp] - The requester's IP, improves Cloudflare's scoring.
 * @returns {Promise<boolean>} Whether the token is valid.
 */
export async function verifyTurnstileToken(token, remoteIp) {
  if (!isTurnstileEnabled()) return true;
  if (!token || typeof token !== 'string') return false;

  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
