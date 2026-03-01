import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Band Members API', () => {
  let admin, member;
  let workspaceId;
  let bandMemberId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'BM Admin' });
    member = await createTestUser({ displayName: 'BM Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Band Members Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  // ── Create Band Member ──

  describe('POST /api/band-members/workspace/:workspaceId', () => {
    it('should create a band member (admin)', async () => {
      const res = await request(app)
        .post(`/api/band-members/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'John Guitarist',
          stints: [{ instruments: ['Lead Guitar'], startDate: '2020-01-01' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('John Guitarist');

      bandMemberId = res.body.id;
    });

    it('should create a guest member', async () => {
      const res = await request(app)
        .post(`/api/band-members/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Guest Singer',
          isGuest: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.isGuest).toBe(true);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .post(`/api/band-members/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ name: 'Hacked Member', stints: [{ instruments: ['Drums'], startDate: '2020-01-01' }] });

      expect(res.status).toBe(403);
    });
  });

  // ── Get Band Members ──

  describe('GET /api/band-members/workspace/:workspaceId', () => {
    it('should return all band members', async () => {
      const res = await request(app)
        .get(`/api/band-members/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.current).toBeDefined();
      expect(res.body.all.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Get Single Band Member ──

  describe('GET /api/band-members/:memberId', () => {
    it('should return band member details', async () => {
      const res = await request(app)
        .get(`/api/band-members/${bandMemberId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('John Guitarist');
    });
  });

  // ── Update Band Member ──

  describe('PUT /api/band-members/:memberId', () => {
    it('should update band member (admin)', async () => {
      const res = await request(app)
        .put(`/api/band-members/${bandMemberId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'John Guitarist', notes: 'Joined in 2020', stints: [{ instruments: ['Rhythm Guitar'], startDate: '2020-01-01' }] });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('John Guitarist');
    });

    it('should link band member to user account', async () => {
      const res = await request(app)
        .put(`/api/band-members/${bandMemberId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: admin.user.id });

      expect(res.status).toBe(200);
    });
  });

  // ── Delete Band Member ──

  describe('DELETE /api/band-members/:memberId', () => {
    it('should delete band member (admin)', async () => {
      const res = await request(app)
        .delete(`/api/band-members/${bandMemberId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
