import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Timeline API', () => {
  let admin;
  let workspaceId;
  let eventId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Timeline Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Timeline Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/timeline/workspace/:workspaceId', () => {
    it('should create a timeline event', async () => {
      const res = await request(app)
        .post(`/api/timeline/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Band Formed',
          eventDate: '2020-01-15',
          eventType: 'milestone',
          description: 'The band was officially formed',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Band Formed');

      eventId = res.body.id;
    });
  });

  describe('GET /api/timeline/workspace/:workspaceId', () => {
    it('should return timeline events', async () => {
      const res = await request(app)
        .get(`/api/timeline/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /api/timeline/:eventId', () => {
    it('should update a timeline event', async () => {
      const res = await request(app)
        .put(`/api/timeline/${eventId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Band Founded' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Band Founded');
    });
  });

  describe('POST /api/timeline/workspace/:workspaceId/generate', () => {
    it('should auto-generate timeline events', async () => {
      const res = await request(app)
        .post(`/api/timeline/workspace/${workspaceId}/generate`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/timeline/:eventId', () => {
    it('should delete a timeline event', async () => {
      const res = await request(app)
        .delete(`/api/timeline/${eventId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
