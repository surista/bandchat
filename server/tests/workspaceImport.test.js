import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Workspace Import API', () => {
  let admin, member;
  let workspace;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'WsImport Admin' });
    member = await createTestUser({ displayName: 'WsImport Member' });

    workspace = await createTestWorkspace(admin.token);
    await addMemberToWorkspace(workspace.id, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/workspace-import/parse', () => {
    it('should require authentication (401)', async () => {
      const res = await request(app)
        .post('/api/workspace-import/parse');

      expect(res.status).toBe(401);
    });

    it('should reject request with no file (400)', async () => {
      const res = await request(app)
        .post('/api/workspace-import/parse')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/workspace-import/execute', () => {
    it('should require authentication (401)', async () => {
      const res = await request(app)
        .post('/api/workspace-import/execute')
        .send({ sessionId: 'fake-session-id' });

      expect(res.status).toBe(401);
    });

    it('should reject without valid import session (404)', async () => {
      const res = await request(app)
        .post('/api/workspace-import/execute')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ sessionId: 'non-existent-session-id' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/session expired/i);
    });
  });

  describe('Access Control', () => {
    it('should reject execute without sessionId (400)', async () => {
      const res = await request(app)
        .post('/api/workspace-import/execute')
        .set('Authorization', `Bearer ${member.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing sessionId/i);
    });
  });
});
