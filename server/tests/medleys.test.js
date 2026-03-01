import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Medleys API', () => {
  let admin;
  let workspaceId;
  let medleyId, songIds = [];

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Medley Admin' });

    const ws = await createTestWorkspace(admin.token, { name: 'Medley Test WS' });
    workspaceId = ws.id;

    const s1 = await createTestSong(workspaceId, admin.token, { title: 'Medley Song A', artist: 'Artist' });
    const s2 = await createTestSong(workspaceId, admin.token, { title: 'Medley Song B', artist: 'Artist' });
    const s3 = await createTestSong(workspaceId, admin.token, { title: 'Medley Song C', artist: 'Artist' });
    songIds = [s1.id, s2.id, s3.id];
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/medleys/workspace/:workspaceId', () => {
    it('should create a medley', async () => {
      const res = await request(app)
        .post(`/api/medleys/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Rock Medley', songIds: [songIds[0], songIds[1]] });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Rock Medley');

      medleyId = res.body.id;
    });

    it('should reject medley with less than 2 songs', async () => {
      const res = await request(app)
        .post(`/api/medleys/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Too Short', songIds: [songIds[0]] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/medleys/workspace/:workspaceId', () => {
    it('should return all medleys', async () => {
      const res = await request(app)
        .get(`/api/medleys/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/medleys/:medleyId', () => {
    it('should return medley details', async () => {
      const res = await request(app)
        .get(`/api/medleys/${medleyId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Rock Medley');
      expect(res.body.songs.length).toBe(2);
    });
  });

  describe('PUT /api/medleys/:medleyId', () => {
    it('should update medley', async () => {
      const res = await request(app)
        .put(`/api/medleys/${medleyId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Classic Rock Medley', songIds: [songIds[0], songIds[1], songIds[2]] });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Classic Rock Medley');
    });
  });

  describe('PUT /api/medleys/:medleyId/reorder', () => {
    it('should reorder songs in medley', async () => {
      const res = await request(app)
        .put(`/api/medleys/${medleyId}/reorder`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songIds: [songIds[2], songIds[0], songIds[1]] });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/medleys/:medleyId', () => {
    it('should delete a medley', async () => {
      const res = await request(app)
        .delete(`/api/medleys/${medleyId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
