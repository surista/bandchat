import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace, setWorkspacePlan } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Plan Gating', () => {
  let admin, member;
  let workspaceId, songId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Plan Admin' });
    member = await createTestUser({ displayName: 'Plan Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Plan Gating WS' });
    workspaceId = ws.id;

    await addMemberToWorkspace(workspaceId, member.token, admin.token);

    const song = await createTestSong(workspaceId, admin.token, {
      title: 'Plan Test Song',
      artist: 'Test Artist',
    });
    songId = song.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('Kitty (PRO only)', () => {
    it('should return 403 on FREE workspace', async () => {
      await setWorkspacePlan(workspaceId, 'FREE');

      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(403);
      expect(res.body.upgrade).toBe(true);
    });

    it('should return 200 on PRO workspace', async () => {
      await setWorkspacePlan(workspaceId, 'PRO');

      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Practice (PRO only)', () => {
    it('should return 403 on FREE workspace', async () => {
      await setWorkspacePlan(workspaceId, 'FREE');

      const res = await request(app)
        .post(`/api/practice/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId, duration: 30 });

      expect(res.status).toBe(403);
      expect(res.body.upgrade).toBe(true);
    });

    it('should return 201 on PRO workspace', async () => {
      await setWorkspacePlan(workspaceId, 'PRO');

      const res = await request(app)
        .post(`/api/practice/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId, duration: 30 });

      expect(res.status).toBe(201);
    });
  });

  describe('Stats (PRO only)', () => {
    it('should return 403 on FREE workspace', async () => {
      await setWorkspacePlan(workspaceId, 'FREE');

      const res = await request(app)
        .get(`/api/gigs/workspace/${workspaceId}/stats`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(403);
      expect(res.body.upgrade).toBe(true);
    });

    it('should return 200 on PRO workspace', async () => {
      await setWorkspacePlan(workspaceId, 'PRO');

      const res = await request(app)
        .get(`/api/gigs/workspace/${workspaceId}/stats`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Song Intelligence / Suggestions (PRO only)', () => {
    it('should return 403 on FREE workspace for mashups', async () => {
      await setWorkspacePlan(workspaceId, 'FREE');

      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/mashups/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(403);
      expect(res.body.upgrade).toBe(true);
    });

    it('should return 200 on PRO workspace for mashups', async () => {
      await setWorkspacePlan(workspaceId, 'PRO');

      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/mashups/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Plan Expiry', () => {
    it('should treat workspace with expired planExpiresAt as FREE', async () => {
      await setWorkspacePlan(workspaceId, 'PRO', new Date('2020-01-01'));

      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(403);
      expect(res.body.upgrade).toBe(true);
    });

    it('should treat workspace with null planExpiresAt (lifetime) as PRO', async () => {
      await setWorkspacePlan(workspaceId, 'PRO', null);

      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should treat workspace with future planExpiresAt as PRO', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      await setWorkspacePlan(workspaceId, 'PRO', futureDate);

      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
