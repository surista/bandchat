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

// ─── Length / shape helpers for free-form text ──────────────────────────────
//
// Standardized caps so we don't repeat magic numbers across routes. Anything
// above these limits is almost certainly an abuse attempt or a UI bug, not a
// real user trying to enter a long name. Server enforcement is the floor —
// individual routes can be stricter (e.g. song titles cap at 200).

export const TEXT_LIMITS = {
  NAME: 120,            // person/workspace/channel/song-short names
  TITLE: 200,           // longer titles (song titles, gig titles, venue names)
  LABEL: 60,            // short labels (key, status, tags)
  URL: 2048,            // any user-supplied URL
  SHORT_TEXT: 500,      // one-line freeform (descriptions, notes-light)
  LONG_TEXT: 5000,      // multi-paragraph notes/comments
  MESSAGE_BODY: 10000,  // chat message content
  LYRICS: 50000,        // song lyrics (full)
};

/**
 * Returns null if the value is valid, or an error string if it isn't.
 *
 * `required`: when true, an empty/missing value returns an error.
 *             when false (default), empty values are treated as "not provided"
 *             and skip the length check.
 */
export function checkText(value, fieldLabel, max, { required = false, minTrim = 0 } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? `${fieldLabel} is required` : null;
  }
  if (typeof value !== 'string') {
    return `${fieldLabel} must be a string`;
  }
  if (minTrim > 0 && value.trim().length < minTrim) {
    return `${fieldLabel} must be at least ${minTrim} characters`;
  }
  if (value.length > max) {
    return `${fieldLabel} must be ${max.toLocaleString()} characters or less`;
  }
  return null;
}

/**
 * Validate a set of text fields at once. Returns the first error found, or null
 * if all fields pass. Usage:
 *
 *   const err = validateTextFields([
 *     ['name', name, TEXT_LIMITS.NAME, { required: true, minTrim: 1 }],
 *     ['description', description, TEXT_LIMITS.SHORT_TEXT],
 *   ]);
 *   if (err) return res.status(400).json({ error: err });
 */
export function validateTextFields(fields) {
  for (const [label, value, max, opts] of fields) {
    const err = checkText(value, label, max, opts);
    if (err) return err;
  }
  return null;
}
