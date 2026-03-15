/**
 * Plan definitions and limit-checking helpers.
 * Used by routes to enforce free/pro tier limits.
 */

export const PLAN_LIMITS = {
  FREE: {
    maxMembers: 3,
    messageRetentionDays: 90,
    storageBytes: 500n * 1024n * 1024n,        // 500 MB
    maxSongs: 20,
    maxSetlists: 3,
    maxThemes: 3,
    features: {
      kitty: false,
      stats: false,
      practice: false,
      pdfExport: false,
      slackImport: false,
      songIntelligence: false,
      customWebsite: true,
    },
  },
  PRO: {
    maxMembers: Infinity,
    messageRetentionDays: null,                  // unlimited
    storageBytes: 10n * 1024n * 1024n * 1024n,  // 10 GB
    maxSongs: Infinity,
    maxSetlists: Infinity,
    maxThemes: Infinity,
    features: {
      kitty: true,
      stats: true,
      practice: true,
      pdfExport: true,
      slackImport: true,
      songIntelligence: true,
      customWebsite: true,
    },
  },
};

// First 3 themes available on free tier
export const FREE_THEME_IDS = ['default', 'midnight', 'ocean'];

/**
 * Get the effective plan for a workspace, checking expiry.
 * Returns "FREE" or "PRO".
 */
export function getEffectivePlan(workspace) {
  if (!workspace || workspace.plan !== 'PRO') return 'FREE';
  // null expiry = lifetime, still PRO
  if (workspace.planExpiresAt && new Date() > new Date(workspace.planExpiresAt)) return 'FREE';
  return 'PRO';
}

/**
 * Get the plan limits object for a workspace.
 */
export function getPlanLimits(workspace) {
  return PLAN_LIMITS[getEffectivePlan(workspace)];
}

/**
 * Serializable plan limits for API responses (converts BigInt to string).
 */
export function serializePlanLimits(limits) {
  const result = {
    ...limits,
    storageBytes: limits.storageBytes.toString(),
  };
  for (const [key, val] of Object.entries(result)) {
    if (val === Infinity) result[key] = -1;
  }
  return result;
}
