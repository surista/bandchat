import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Sync API', () => {
  let admin, outsider;
  let workspace;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Sync Admin' });
    outsider = await createTestUser({ displayName: 'Sync Outsider' });

    workspace = await createTestWorkspace(admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  describe('GET /api/sync/:workspaceId/pull', () => {
    it('should return data for member (200)', async () => {
      const res = await request(app)
        .get(`/api/sync/${workspace.id}/pull?entities=channels`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('serverTime');
    });

    it('should reject non-member (403)', async () => {
      const res = await request(app)
        .get(`/api/sync/${workspace.id}/pull`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication (401)', async () => {
      const res = await request(app)
        .get(`/api/sync/${workspace.id}/pull`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/sync/:workspaceId/push', () => {
    it('should reject non-member (403)', async () => {
      const res = await request(app)
        .post(`/api/sync/${workspace.id}/push`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ operations: [] });

      expect(res.status).toBe(403);
    });

    it('should require authentication (401)', async () => {
      const res = await request(app)
        .post(`/api/sync/${workspace.id}/push`)
        .send({ operations: [] });

      expect(res.status).toBe(401);
    });

    it('should accept valid push payload (200)', async () => {
      const res = await request(app)
        .post(`/api/sync/${workspace.id}/push`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ operations: [] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
    });
  });
});
