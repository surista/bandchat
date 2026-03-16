import request from 'supertest';
import app from '../setup/app.js';
import prisma from './prisma.js';

let userCounter = 0;

/**
 * Create a test user via the signup endpoint.
 * Returns { user, token, refreshToken }
 */
export async function createTestUser(overrides = {}) {
  userCounter++;
  const email = overrides.email || `testuser${userCounter}_${Date.now()}@test.com`;
  const password = overrides.password || 'TestPass123!';
  const displayName = overrides.displayName || `Test User ${userCounter}`;

  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password, displayName });

  if (res.status !== 201) {
    throw new Error(`Failed to create test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    user: res.body.user,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    email,
    password,
  };
}

/**
 * Login an existing user. Returns { user, token, refreshToken }
 */
export async function loginUser(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Failed to login: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    user: res.body.user,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/**
 * Clean up a test user by deleting from database directly.
 */
export async function cleanupUser(userId) {
  try {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    // User might already be deleted
  }
}

/**
 * Promote a user to system admin via direct DB update.
 */
export async function makeSystemAdmin(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { isSystemAdmin: true },
  });
}
