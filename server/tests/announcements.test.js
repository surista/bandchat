import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Announcements API', () => {
  let admin, member;
  let workspaceId;
  let announcementId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Ann Admin' });
    member = await createTestUser({ displayName: 'Ann Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Announcement Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/announcements/workspace/:workspaceId', () => {
    it('should create an announcement (admin)', async () => {
      const res = await request(app)
        .post(`/api/announcements/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Band Meeting',
          content: 'Please attend the band meeting this Friday.',
          priority: 'high',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Band Meeting');

      announcementId = res.body.id;
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .post(`/api/announcements/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ title: 'Hacked', content: 'Should fail' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/announcements/workspace/:workspaceId', () => {
    it('should return announcements', async () => {
      const res = await request(app)
        .get(`/api/announcements/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/announcements/:announcementId', () => {
    it('should return announcement details', async () => {
      const res = await request(app)
        .get(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Band Meeting');
    });
  });

  describe('POST /api/announcements/:announcementId/acknowledge', () => {
    it('should acknowledge an announcement', async () => {
      const res = await request(app)
        .post(`/api/announcements/${announcementId}/acknowledge`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(201);
    });

    it('should handle duplicate acknowledge gracefully', async () => {
      const res = await request(app)
        .post(`/api/announcements/${announcementId}/acknowledge`)
        .set('Authorization', `Bearer ${member.token}`);

      // Should be 200 or 409, not a server error
      expect([200, 409]).toContain(res.status);
    });
  });

  describe('PUT /api/announcements/:announcementId', () => {
    it('should update announcement (admin)', async () => {
      const res = await request(app)
        .put(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Updated Band Meeting' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Band Meeting');
    });
  });

  describe('DELETE /api/announcements/:announcementId', () => {
    it('should delete announcement (admin)', async () => {
      const res = await request(app)
        .delete(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
