import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Availability API', () => {
  let admin;
  let workspaceId;
  const testDate = '2026-04-15';

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Avail Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Availability Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('PUT /api/availability/workspace/:workspaceId/date/:date', () => {
    it('should set availability for a date', async () => {
      const res = await request(app)
        .put(`/api/availability/workspace/${workspaceId}/date/${testDate}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'AVAILABLE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('AVAILABLE');
    });

    it('should update availability', async () => {
      const res = await request(app)
        .put(`/api/availability/workspace/${workspaceId}/date/${testDate}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'UNAVAILABLE', note: 'Out of town' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UNAVAILABLE');
    });
  });

  describe('PUT /api/availability/workspace/:workspaceId/bulk', () => {
    it('should bulk set availability', async () => {
      const res = await request(app)
        .put(`/api/availability/workspace/${workspaceId}/bulk`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          dates: ['2026-04-16', '2026-04-17'],
          status: 'AVAILABLE',
        });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/availability/workspace/:workspaceId/me', () => {
    it('should return own availability', async () => {
      const res = await request(app)
        .get(`/api/availability/workspace/${workspaceId}/me`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/availability/workspace/:workspaceId', () => {
    it('should return all members availability', async () => {
      const res = await request(app)
        .get(`/api/availability/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/availability/workspace/:workspaceId/summary/:date', () => {
    it('should return availability summary for a date', async () => {
      const res = await request(app)
        .get(`/api/availability/workspace/${workspaceId}/summary/${testDate}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/availability/workspace/:workspaceId/date/:date', () => {
    it('should clear availability', async () => {
      const res = await request(app)
        .delete(`/api/availability/workspace/${workspaceId}/date/${testDate}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
