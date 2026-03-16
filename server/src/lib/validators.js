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

/**
 * Express middleware that validates named route params are valid UUIDs.
 * Usage: router.get('/:workspaceId', validateUUID('workspaceId'), ...)
 */
export function validateUUID(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !isValidUUID(value)) {
        return res.status(400).json({ error: `Invalid ${name}` });
      }
    }
    next();
  };
}
