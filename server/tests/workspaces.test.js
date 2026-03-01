import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Workspaces API', () => {
  let admin, member, outsider;
  let workspaceId, inviteCode;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'WS Admin' });
    member = await createTestUser({ displayName: 'WS Member' });
    outsider = await createTestUser({ displayName: 'WS Outsider' });
  });

  afterAll(async () => {
    if (workspaceId) await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Create Workspace ──

  describe('POST /api/workspaces', () => {
    it('should create a workspace', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Test Band Workspace' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Band Workspace');
      expect(res.body.id).toBeDefined();

      workspaceId = res.body.id;
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'No Auth WS' });

      expect(res.status).toBe(401);
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should reject name over 100 chars', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });
  });

  // ── Get Workspaces ──

  describe('GET /api/workspaces', () => {
    it('should return workspaces for authenticated user', async () => {
      const res = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(ws => ws.id === workspaceId)).toBe(true);
    });
  });

  // ── Get Workspace Details ──

  describe('GET /api/workspaces/:workspaceId', () => {
    it('should return workspace details for member', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Band Workspace');
      expect(res.body.members).toBeDefined();

      inviteCode = res.body.inviteCode;
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Invite & Join ──

  describe('Invite & Join flow', () => {
    it('should generate an invite code', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite-code`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.inviteCode).toBeDefined();

      inviteCode = res.body.inviteCode;
    });

    it('should join workspace with invite code', async () => {
      const res = await request(app)
        .post(`/api/workspaces/join/${inviteCode}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
    });

    it('should reject joining with invalid invite code', async () => {
      const res = await request(app)
        .post('/api/workspaces/join/INVALIDCODE')
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(404);
    });

    it('should reject duplicate join', async () => {
      const res = await request(app)
        .post(`/api/workspaces/join/${inviteCode}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(400);
    });
  });

  // ── Update Workspace ──

  describe('PUT /api/workspaces/:workspaceId', () => {
    it('should update workspace name (admin)', async () => {
      const res = await request(app)
        .put(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Updated Band Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Band Name');
    });

    it('should reject non-admin update', async () => {
      const res = await request(app)
        .put(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
    });
  });

  // ── Member Management ──

  describe('Member management', () => {
    it('should update member role (admin)', async () => {
      const res = await request(app)
        .put(`/api/workspaces/${workspaceId}/members/${member.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);
    });

    it('should get member profile', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}/members/${member.user.id}/profile`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBeDefined();
    });

    // Revert back to MEMBER for further tests
    it('should demote member back to MEMBER', async () => {
      const res = await request(app)
        .put(`/api/workspaces/${workspaceId}/members/${member.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(200);
    });
  });

  // ── Leave Workspace ──

  describe('POST /api/workspaces/:workspaceId/leave', () => {
    it('should allow member to leave', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/leave`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
    });

    it('should not allow last admin to leave', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/leave`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });
  });

  // ── Export Workspace ──

  describe('GET /api/workspaces/:workspaceId/export', () => {
    it('should export workspace data (admin)', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}/export`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.workspace).toBeDefined();
    });
  });
});
