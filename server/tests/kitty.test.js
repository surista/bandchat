import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Kitty API', () => {
  let admin, member;
  let workspaceId;
  let transactionId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Kitty Admin' });
    member = await createTestUser({ displayName: 'Kitty Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Kitty Test WS' });
    workspaceId = ws.id;

    // Add member using invite flow
    const wsRes = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    const inviteCode = wsRes.body.inviteCode;
    if (inviteCode) {
      await request(app)
        .post(`/api/workspaces/join/${inviteCode}`)
        .set('Authorization', `Bearer ${member.token}`);
    }
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('GET /api/kitty/workspace/:workspaceId', () => {
    it('should return kitty data', async () => {
      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.currency).toBeDefined();
    });
  });

  describe('PUT /api/kitty/workspace/:workspaceId', () => {
    it('should update kitty settings (admin)', async () => {
      const res = await request(app)
        .put(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ startingBalance: 1000, currency: 'GBP' });

      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('GBP');
      expect(Number(res.body.startingBalance)).toBe(1000);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .put(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/kitty/workspace/:workspaceId/transactions', () => {
    it('should create a transaction', async () => {
      const res = await request(app)
        .post(`/api/kitty/workspace/${workspaceId}/transactions`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          amount: 500,
          type: 'OTHER_INCOME',
          description: 'Gig payment',
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.amount)).toBe(500);

      transactionId = res.body.id;
    });

    it('should create an expense transaction', async () => {
      const res = await request(app)
        .post(`/api/kitty/workspace/${workspaceId}/transactions`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          amount: 100,
          type: 'EXPENSE',
          description: 'New strings',
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/kitty/transactions/:transactionId', () => {
    it('should update a transaction', async () => {
      const res = await request(app)
        .put(`/api/kitty/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ amount: 600, description: 'Updated gig payment' });

      expect(res.status).toBe(200);
      expect(Number(res.body.amount)).toBe(600);
    });
  });

  describe('Balance calculation', () => {
    it('should correctly calculate balance', async () => {
      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      // Starting 1000 + income 600 - expense 100 = 1500
      expect(Number(res.body.currentBalance)).toBe(1500);
    });
  });

  describe('DELETE /api/kitty/transactions/:transactionId', () => {
    it('should delete a transaction', async () => {
      const res = await request(app)
        .delete(`/api/kitty/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
