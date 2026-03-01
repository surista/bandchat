import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Setlists API', () => {
  let admin, member;
  let workspaceId;
  let setlistId, songIds = [];
  let mcItemId, breakItemId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'SL Admin' });
    member = await createTestUser({ displayName: 'SL Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Setlist Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);

    // Create some songs for setlist tests
    const song1 = await createTestSong(workspaceId, admin.token, { title: 'SL Song 1', artist: 'Artist 1' });
    const song2 = await createTestSong(workspaceId, admin.token, { title: 'SL Song 2', artist: 'Artist 2' });
    const song3 = await createTestSong(workspaceId, admin.token, { title: 'SL Song 3', artist: 'Artist 3' });
    songIds = [song1.id, song2.id, song3.id];
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  // ── Create Setlist ──

  describe('POST /api/setlists/workspace/:workspaceId', () => {
    it('should create a setlist', async () => {
      const res = await request(app)
        .post(`/api/setlists/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Friday Night Set' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Friday Night Set');

      setlistId = res.body.id;
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post(`/api/setlists/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── Get Setlists ──

  describe('GET /api/setlists/workspace/:workspaceId', () => {
    it('should return all setlists', async () => {
      const res = await request(app)
        .get(`/api/setlists/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Add Songs to Setlist ──

  describe('POST /api/setlists/:setlistId/songs', () => {
    it('should add a song to setlist', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/songs`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId: songIds[0] });

      expect(res.status).toBe(201);
    });

    it('should add a second song', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/songs`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId: songIds[1] });

      expect(res.status).toBe(201);
    });

    it('should add a third song', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/songs`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId: songIds[2] });

      expect(res.status).toBe(201);
    });
  });

  // ── Add MC Break ──

  describe('POST /api/setlists/:setlistId/mc', () => {
    it('should add an MC break', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/mc`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ label: 'Welcome speech' });

      expect(res.status).toBe(201);
      mcItemId = res.body.id;
    });
  });

  // ── Add Set Break ──

  describe('POST /api/setlists/:setlistId/set-break', () => {
    it('should add a set break', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/set-break`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(201);
      breakItemId = res.body.id;
    });
  });

  // ── Get Setlist ──

  describe('GET /api/setlists/:setlistId', () => {
    it('should return setlist with items', async () => {
      const res = await request(app)
        .get(`/api/setlists/${setlistId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Friday Night Set');
      expect(res.body.songs.length).toBe(5); // 3 songs + MC + break
    });
  });

  // ── Reorder ──

  describe('PUT /api/setlists/:setlistId/reorder', () => {
    it('should reorder items', async () => {
      // Get current items
      const getRes = await request(app)
        .get(`/api/setlists/${setlistId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const songs = getRes.body.songs;
      const reorderedIds = songs.map(i => i.id).reverse();

      const res = await request(app)
        .put(`/api/setlists/${setlistId}/reorder`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ itemIds: reorderedIds });

      expect(res.status).toBe(200);
    });
  });

  // ── Update Setlist ──

  describe('PUT /api/setlists/:setlistId', () => {
    it('should update setlist name', async () => {
      const res = await request(app)
        .put(`/api/setlists/${setlistId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Saturday Night Set' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Saturday Night Set');
    });
  });

  // ── Duplicate Setlist ──

  describe('POST /api/setlists/:setlistId/duplicate', () => {
    it('should duplicate a setlist', async () => {
      const res = await request(app)
        .post(`/api/setlists/${setlistId}/duplicate`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(201);
      expect(res.body.name).toContain('Saturday Night Set');
      expect(res.body.songs.length).toBe(5);
    });
  });

  // ── Remove Item ──

  describe('DELETE /api/setlists/:setlistId/items/:itemId', () => {
    it('should remove MC break from setlist', async () => {
      const res = await request(app)
        .delete(`/api/setlists/${setlistId}/items/${mcItemId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Delete Setlist ──

  describe('DELETE /api/setlists/:setlistId', () => {
    it('should delete a setlist', async () => {
      const res = await request(app)
        .delete(`/api/setlists/${setlistId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
