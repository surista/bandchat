/**
 * Input validation utilities
 */

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 * @param {string} str - The string to validate
 * @returns {boolean} - True if valid UUID
 */
export function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  return UUID_REGEX.test(str);
}

/**
 * Validate and parse an integer from string with bounds
 * @param {string} value - The value to parse
 * @param {object} options - Options for validation
 * @param {number} options.min - Minimum value (default: 1)
 * @param {number} options.max - Maximum value (default: Infinity)
 * @param {number} options.defaultValue - Default if invalid
 * @returns {number} - Parsed integer or default
 */
export function parseIntSafe(value, { min = 1, max = Infinity, defaultValue = 1 } = {}) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Validate recording type
 * @param {string} type - The type to validate
 * @returns {boolean} - True if valid type
 */
export function isValidRecordingType(type) {
  return ['audio', 'video'].includes(type);
}
