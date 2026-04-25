import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : undefined;

// General API rate limit. Per-user when authenticated (req.user.id is populated
// by the authenticate middleware on routes that need it; for anonymous endpoints
// it falls back to IP). The cap is intentionally generous because chat use is
// burst-heavy: a channel switch can fire 5–10 parallel reads, and the
// per-action limiters (messageLimiter, searchLimiter, authLimiter) handle
// abuse on the actually-expensive endpoints. OPTIONS preflights are skipped —
// they're CORS housekeeping, not work, and counting them effectively halves
// every user's budget.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000,
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (req) => isTest || req.method === 'OPTIONS',
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limit for auth endpoints (login, signup, account changes)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: skipInTest,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limit for verification/reset token endpoints (prevent brute-force guessing)
export const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: skipInTest,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});


// Stricter limit for refresh token endpoint (prevent token abuse)
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  skip: skipInTest,
  message: { error: 'Too many refresh attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for sending messages
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  skip: skipInTest,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Slow down! Too many messages' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for data export endpoints (user data export, workspace export)
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skip: skipInTest,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many export requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for message search
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  skip: skipInTest,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many search requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for website deploy endpoint (expensive operation)
export const deployLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skip: skipInTest,
  message: { error: 'Too many deploy requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for sync pull endpoint
export const syncLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  skip: skipInTest,
  message: { error: 'Too many sync requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for public website form submissions (song requests, contact forms)
export const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 submissions per hour per IP
  skip: skipInTest,
  message: { error: 'Too many submissions, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
