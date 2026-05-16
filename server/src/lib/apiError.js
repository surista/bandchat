/**
 * Structured API error + async handler wrapper.
 *
 * Lets new routes throw typed errors instead of writing repetitive
 * try / console.error / res.status(N).json(...) blocks. Existing routes
 * are unaffected — the global error handler in app.js handles plain Errors
 * the same way it always has.
 *
 * Usage:
 *
 *   import { ApiError, asyncHandler } from '../lib/apiError.js';
 *
 *   router.get('/:id', asyncHandler(async (req, res) => {
 *     const item = await prisma.foo.findUnique({ where: { id: req.params.id } });
 *     if (!item) throw new ApiError(404, 'Not found', { code: 'NOT_FOUND' });
 *     res.json(item);
 *   }));
 *
 * The thrown ApiError reaches the global handler (app.js) which formats it
 * as `{ error, code?, requestId }` and sets the matching status code.
 */
export class ApiError extends Error {
  constructor(status, message, { code = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Wraps an async route handler so rejected promises propagate to Express's
 * error middleware. Without this, an unhandled async throw becomes an
 * UnhandledPromiseRejection and the request hangs until the client timeout.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
