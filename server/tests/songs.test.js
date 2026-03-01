import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Songs API', () => {
  let admin, member, outsider;
  let workspaceId;
  let songId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Song Admin' });
    member = await createTestUser({ displayName: 'Song Member' });
    outsider = await createTestUser({ displayName: 'Song Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'Song Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Create Song ──

  describe('POST /api/songs/workspace/:workspaceId', () => {
    it('should create a song', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          key: 'Bb',
          tempo: 72,
          duration: 354,
          status: 'READY',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Bohemian Rhapsody');
      expect(res.body.artist).toBe('Queen');

      songId = res.body.id;
    });

    it('should reject duplicate title in workspace', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Bohemian Rhapsody', artist: 'Queen' });

      expect(res.status).toBe(400);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Hacked Song', artist: 'Nobody' });

      expect(res.status).toBe(403);
    });

    it('should create a second song', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({
          title: 'Hotel California',
          artist: 'Eagles',
          key: 'Bm',
          tempo: 74,
          duration: 391,
        });

      expect(res.status).toBe(201);
    });
  });

  // ── Get Songs ──

  describe('GET /api/songs/workspace/:workspaceId', () => {
    it('should return all songs', async () => {
      const res = await request(app)
        .get(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  // ── Get Single Song ──

  describe('GET /api/songs/:songId', () => {
    it('should return song details', async () => {
      const res = await request(app)
        .get(`/api/songs/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Bohemian Rhapsody');
    });
  });

  // ── Update Song ──

  describe('PUT /api/songs/:songId', () => {
    it('should update song', async () => {
      const res = await request(app)
        .put(`/api/songs/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ bpm: 76, notes: 'Updated tempo' });

      expect(res.status).toBe(200);
      expect(res.body.bpm).toBe(76);
    });
  });

  // ── Bulk Import ──

  describe('POST /api/songs/workspace/:workspaceId/bulk', () => {
    it('should bulk import songs', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}/bulk`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          songs: [
            { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
            { title: 'Free Bird', artist: 'Lynyrd Skynyrd' },
            { title: 'Comfortably Numb', artist: 'Pink Floyd' },
          ],
          fetchMetadata: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.created.length).toBe(3);
    });

    it('should skip duplicates in bulk import', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}/bulk`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          songs: [
            { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
            { title: 'New Song', artist: 'New Artist' },
          ],
          fetchMetadata: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.created.length).toBe(1);
      expect(res.body.skipped.length).toBe(1);
    });
  });

  // ── Delete Song ──

  describe('DELETE /api/songs/:songId', () => {
    it('should delete a song', async () => {
      const res = await request(app)
        .delete(`/api/songs/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for deleted song', async () => {
      const res = await request(app)
        .get(`/api/songs/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(404);
    });
  });
});
