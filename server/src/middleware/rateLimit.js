import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : undefined;

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  skip: skipInTest,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limit for auth endpoints (login, signup)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: skipInTest,
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
  message: { error: 'Slow down! Too many messages' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for data export endpoints (user data export, workspace export)
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  skip: skipInTest,
  message: { error: 'Too many export requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limit for message search
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  skip: skipInTest,
  message: { error: 'Too many search requests, please slow down' },
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
