import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Stage Plots API', () => {
  let admin, outsider;
  let workspaceId;
  let plotId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'StagePlot Admin' });
    outsider = await createTestUser({ displayName: 'StagePlot Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'StagePlot Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Create ──

  describe('POST /api/stage-plots/workspace/:workspaceId', () => {
    it('should create a stage plot', async () => {
      const res = await request(app)
        .post(`/api/stage-plots/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Test Plot',
          data: { items: [], stageWidth: 900, stageHeight: 500, theme: 'default' },
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Plot');
      expect(res.body).toHaveProperty('id');
      plotId = res.body.id;
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/stage-plots/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Outsider Plot' });

      expect(res.status).toBe(403);
    });
  });

  // ── List ──

  describe('GET /api/stage-plots/workspace/:workspaceId', () => {
    it('should list plots', async () => {
      const res = await request(app)
        .get(`/api/stage-plots/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Get Single ──

  describe('GET /api/stage-plots/:plotId', () => {
    it('should return a single plot', async () => {
      const res = await request(app)
        .get(`/api/stage-plots/${plotId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(plotId);
      expect(res.body.title).toBe('Test Plot');
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/stage-plots/${plotId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Update ──

  describe('PUT /api/stage-plots/:plotId', () => {
    it('should update a plot', async () => {
      const res = await request(app)
        .put(`/api/stage-plots/${plotId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Updated Plot' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Plot');
    });
  });

  // ── Duplicate ──

  describe('POST /api/stage-plots/:plotId/duplicate', () => {
    it('should duplicate a plot', async () => {
      const res = await request(app)
        .post(`/api/stage-plots/${plotId}/duplicate`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Updated Plot (copy)');
      expect(res.body.id).not.toBe(plotId);
    });
  });

  // ── Delete ──

  describe('DELETE /api/stage-plots/:plotId', () => {
    it('should delete a plot', async () => {
      const res = await request(app)
        .delete(`/api/stage-plots/${plotId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
