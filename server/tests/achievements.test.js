import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Achievements API', () => {
  let admin, member, outsider;
  let workspaceId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Achieve Admin' });
    member = await createTestUser({ displayName: 'Achieve Member' });
    outsider = await createTestUser({ displayName: 'Achieve Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'Achievements Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Definitions ──

  describe('GET /api/achievements/definitions', () => {
    it('should return achievement definitions', async () => {
      const res = await request(app)
        .get('/api/achievements/definitions')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/achievements/definitions');

      expect(res.status).toBe(401);
    });
  });

  // ── Band Achievements ──

  describe('GET /api/achievements/workspace/:workspaceId/band', () => {
    it('should return band achievements', async () => {
      const res = await request(app)
        .get(`/api/achievements/workspace/${workspaceId}/band`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/achievements/workspace/${workspaceId}/band`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Member Achievements ──

  describe('GET /api/achievements/workspace/:workspaceId/members', () => {
    it('should return member achievements', async () => {
      const res = await request(app)
        .get(`/api/achievements/workspace/${workspaceId}/members`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/achievements/workspace/${workspaceId}/members`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Check Achievements ──

  describe('POST /api/achievements/workspace/:workspaceId/check', () => {
    it('should check and award achievements', async () => {
      const res = await request(app)
        .post(`/api/achievements/workspace/${workspaceId}/check`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/achievements/workspace/${workspaceId}/check`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });
});
