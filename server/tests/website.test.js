import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Website API', () => {
  let admin, member, outsider;
  let workspace;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Website Admin' });
    member = await createTestUser({ displayName: 'Website Member' });
    outsider = await createTestUser({ displayName: 'Website Outsider' });

    workspace = await createTestWorkspace(admin.token);
    await addMemberToWorkspace(workspace.id, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  describe('GET /api/website/:workspaceId', () => {
    it('should return website config for member (200)', async () => {
      const res = await request(app)
        .get(`/api/website/${workspace.id}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('websiteEnabled');
    });

    it('should reject non-member (403)', async () => {
      const res = await request(app)
        .get(`/api/website/${workspace.id}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication (401)', async () => {
      const res = await request(app)
        .get(`/api/website/${workspace.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/website/:workspaceId/config', () => {
    it('should reject non-admin member (403)', async () => {
      const res = await request(app)
        .put(`/api/website/${workspace.id}/config`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ bandName: 'Test Band' });

      expect(res.status).toBe(403);
    });

    it('should require authentication (401)', async () => {
      const res = await request(app)
        .put(`/api/website/${workspace.id}/config`)
        .send({ bandName: 'Test Band' });

      expect(res.status).toBe(401);
    });
  });

  describe('Public API', () => {
    it('should return 401 for /api/website/api/:workspaceId/data without token', async () => {
      const res = await request(app)
        .get(`/api/website/api/${workspace.id}/data`);

      expect(res.status).toBe(401);
    });
  });
});
