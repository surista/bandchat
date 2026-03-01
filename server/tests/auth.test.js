import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import prisma from './helpers/prisma.js';

describe('Auth API', () => {
  const testEmail = `auth_test_${Date.now()}@test.com`;
  const testPassword = 'TestPass123!';
  const testName = 'Auth Test User';
  let userId, token, refreshToken;

  afterAll(async () => {
    // Clean up test user
    if (userId) {
      try {
        await prisma.refreshToken.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      } catch {}
    }
    await prisma.$disconnect();
  });

  // ── Signup ──

  describe('POST /api/auth/signup', () => {
    it('should create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: testEmail, password: testPassword, displayName: testName });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.displayName).toBe(testName);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      userId = res.body.user.id;
      token = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: testEmail, password: testPassword, displayName: 'Duplicate' });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'short@test.com', password: '123', displayName: 'Short' });

      expect(res.status).toBe(400);
    });

    it('should reject too-long password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'long@test.com', password: 'a'.repeat(129), displayName: 'Long' });

      expect(res.status).toBe(400);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'incomplete@test.com' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'notanemail', password: testPassword, displayName: 'Bad Email' });

      expect(res.status).toBe(400);
    });
  });

  // ── Login ──

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);

      // Update tokens for subsequent tests
      token = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'noone@test.com', password: testPassword });

      expect(res.status).toBe(401);
    });
  });

  // ── Token Refresh ──

  describe('POST /api/auth/refresh', () => {
    it('should refresh token with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      token = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token-string' });

      expect(res.status).toBe(401);
    });
  });

  // ── Get Me ──

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testEmail);
    });

    it('should reject without auth token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject invalid auth token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');

      expect(res.status).toBe(401);
    });
  });

  // ── Update Profile ──

  describe('PUT /api/auth/me', () => {
    it('should update display name', async () => {
      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Updated Name');
    });

    it('should ignore empty display name update', async () => {
      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: '' });

      // Server accepts but doesn't update to empty — returns 200
      expect(res.status).toBe(200);
    });
  });

  // ── Change Password ──

  describe('PUT /api/auth/password', () => {
    const newPassword = 'NewTestPass456!';

    it('should change password with correct current password', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: testPassword, newPassword });

      expect(res.status).toBe(200);
    });

    it('should login with new password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: newPassword });

      expect(res.status).toBe(200);
      token = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject wrong current password', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongOldPass', newPassword: 'Something123!' });

      expect(res.status).toBe(401);
    });
  });

  // ── Forgot Password ──

  describe('POST /api/auth/forgot-password', () => {
    it('should accept valid email (does not reveal existence)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testEmail });

      // Should always return 200 regardless of whether email exists
      expect(res.status).toBe(200);
    });

    it('should accept non-existent email without error', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.com' });

      expect(res.status).toBe(200);
    });
  });

  // ── Logout ──

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });

      expect(res.status).toBe(200);
    });
  });

  // ── Health Check ──

  describe('GET /api/health', () => {
    it('should return ok', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
