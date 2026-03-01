import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import prisma from './helpers/prisma.js';

describe('Blocks API', () => {
  let user, blockedUser;

  beforeAll(async () => {
    user = await createTestUser({ displayName: 'Block User' });
    blockedUser = await createTestUser({ displayName: 'Blocked User' });
  });

  afterAll(async () => {
    await cleanupUser(user.user.id);
    await cleanupUser(blockedUser.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/blocks', () => {
    it('should block a user', async () => {
      const res = await request(app)
        .post('/api/blocks')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ blockedUserId: blockedUser.user.id });

      expect(res.status).toBe(201);
    });

    it('should reject blocking self', async () => {
      const res = await request(app)
        .post('/api/blocks')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ blockedUserId: user.user.id });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/blocks', () => {
    it('should return blocked users', async () => {
      const res = await request(app)
        .get('/api/blocks')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].blockedUserId).toBe(blockedUser.user.id);
    });
  });

  describe('DELETE /api/blocks/:blockedUserId', () => {
    it('should unblock a user', async () => {
      const res = await request(app)
        .delete(`/api/blocks/${blockedUser.user.id}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
    });

    it('should show empty block list after unblock', async () => {
      const res = await request(app)
        .get('/api/blocks')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });
});
