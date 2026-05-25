import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : undefined;

// Extract a stable per-user key from the JWT for rate limiting. The global
// apiLimiter runs BEFORE per-route `authenticate` middleware, so req.user is
// not yet populated; we have to crack the token ourselves. We verify the
// signature so a malicious actor can't fabricate fresh tokens to get unlimited
// buckets — only tokens issued by this server are honored. On failure (no
// token, expired, invalid), fall back to req.ip.
function userKey(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return req.ip;
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return decoded.userId ? `u:${decoded.userId}` : req.ip;
  } catch {
    return req.ip;
  }
}

// General API rate limit. Per-user via JWT decoded inline (this middleware
// runs before per-route `authenticate`, so we can't read req.user — we crack
// the token ourselves in `userKey`). The cap is intentionally generous
// because chat use is burst-heavy: a channel switch fires 5–10 parallel reads,
// and the per-action limiters (messageLimiter, searchLimiter, authLimiter)
// handle abuse on the actually-expensive endpoints. OPTIONS preflights are
// skipped — they're CORS housekeeping, not work, and counting them
// effectively halves every user's budget.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000,
  keyGenerator: userKey,
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

// Limit for public READ endpoints keyed by workspace slug — keeps slug
// enumeration expensive (paired with the per-workspace bookingEnabled flag).
// More generous than form submission because legitimate users may refresh the
// page, share it, or return from a link in email.
export const publicLookupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  skip: skipInTest,
  message: { error: 'Too many lookups, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
