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
 * Validate recording type
 * @param {string} type - The type to validate
 * @returns {boolean} - True if valid type
 */
export function isValidRecordingType(type) {
  return ['audio', 'video'].includes(type);
}
