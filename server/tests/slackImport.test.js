import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Slack Import API', () => {
  let admin, member;
  let workspace;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'SlackImport Admin' });
    member = await createTestUser({ displayName: 'SlackImport Member' });

    workspace = await createTestWorkspace(admin.token);
    await addMemberToWorkspace(workspace.id, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('Access Control', () => {
    it('should require authentication (401)', async () => {
      const res = await request(app)
        .post(`/api/slack-import/workspace/${workspace.id}/parse`);

      expect(res.status).toBe(401);
    });

    it('should reject non-admin member (403)', async () => {
      const res = await request(app)
        .post(`/api/slack-import/workspace/${workspace.id}/parse`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/slack-import/workspace/:workspaceId/parse', () => {
    it('should reject request with no file (400)', async () => {
      const res = await request(app)
        .post(`/api/slack-import/workspace/${workspace.id}/parse`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject non-admin (403)', async () => {
      const res = await request(app)
        .post(`/api/slack-import/workspace/${workspace.id}/parse`)
        .set('Authorization', `Bearer ${member.token}`)
        .attach('file', Buffer.from('fake zip'), 'export.zip');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/slack-import/workspace/:workspaceId/import', () => {
    it('should reject without valid session (400)', async () => {
      const res = await request(app)
        .post(`/api/slack-import/workspace/${workspace.id}/import`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/missing importSessionId/i);
    });
  });
});
