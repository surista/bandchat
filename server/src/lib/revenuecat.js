// ---------------------------------------------------------------------------
// RevenueCat API helper
// ---------------------------------------------------------------------------

const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

/**
 * Fetch a subscriber object from the RevenueCat API.
 *
 * @param {string} appUserId - The RevenueCat app user ID (BandChat user ID).
 * @returns {Promise<object>} The subscriber object from RevenueCat.
 */
export async function getSubscriber(appUserId) {
  const url = `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.REVENUECAT_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RevenueCat API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.subscriber;
}

/**
 * Check whether a specific entitlement is currently active for a subscriber.
 *
 * @param {object} subscriber - The subscriber object returned by getSubscriber().
 * @param {string} entitlementId - The entitlement identifier to check (e.g. 'pro').
 * @returns {boolean} True if the entitlement exists and has not expired.
 */
export function isEntitlementActive(subscriber, entitlementId) {
  const entitlement = subscriber?.entitlements?.[entitlementId];
  if (!entitlement) return false;

  const { expires_date } = entitlement;
  if (expires_date === null || expires_date === undefined) {
    // Lifetime / non-expiring entitlement
    return true;
  }

  return new Date(expires_date) > new Date();
}

/**
 * Return the store string for an active entitlement ('app_store', 'play_store', etc.),
 * or null if the entitlement is not active.
 *
 * @param {object} subscriber - The subscriber object returned by getSubscriber().
 * @param {string} entitlementId - The entitlement identifier (e.g. 'pro').
 * @returns {string|null} The store identifier, or null.
 */
export function getEntitlementStore(subscriber, entitlementId) {
  if (!isEntitlementActive(subscriber, entitlementId)) return null;
  return subscriber?.entitlements?.[entitlementId]?.store ?? null;
}
