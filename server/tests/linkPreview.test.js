import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import prisma from './helpers/prisma.js';

describe('Link Preview API', () => {
  let admin;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'LinkPreview Admin' });
  });

  afterAll(async () => {
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('GET /api/link-preview', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/link-preview?url=https://example.com');

      expect(res.status).toBe(401);
    });

    it('should reject missing URL param', async () => {
      const res = await request(app)
        .get('/api/link-preview')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject private IP URL', async () => {
      const res = await request(app)
        .get('/api/link-preview?url=http://192.168.1.1')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject localhost URL', async () => {
      const res = await request(app)
        .get('/api/link-preview?url=http://localhost:3000')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject non-HTTP protocol', async () => {
      const res = await request(app)
        .get('/api/link-preview?url=ftp://example.com')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject empty URL', async () => {
      const res = await request(app)
        .get('/api/link-preview?url=')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });
  });
});
