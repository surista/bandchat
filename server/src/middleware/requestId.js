import crypto from 'crypto';

/**
 * Middleware that generates a unique request ID for each request.
 * Useful for distributed tracing and correlating logs across services.
 *
 * The request ID is:
 * - Generated server-side (or accepts client-provided X-Request-ID)
 * - Attached to req.id for use in handlers
 * - Returned in X-Request-ID response header
 * - Logged with errors for debugging
 */
export function requestIdMiddleware(req, res, next) {
  // Accept client-provided request ID or generate one
  // Format: hex string (16 bytes = 32 chars)
  let requestId = req.headers['x-request-id'];

  // Validate client-provided ID (must be alphanumeric, max 64 chars)
  if (!requestId || !/^[a-zA-Z0-9-]{1,64}$/.test(requestId)) {
    requestId = crypto.randomBytes(16).toString('hex');
  }

  // Attach to request object for use in handlers
  req.id = requestId;

  // Set response header for client correlation
  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Helper to log errors with request context.
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {Request} req - Express request object
 */
export function logError(message, error, req) {
  console.error(`[${req?.id || 'no-id'}] ${message}:`, error);
}
