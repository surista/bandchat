import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Recordings API', () => {
  let admin;
  let workspaceId, songId;
  let recordingId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Recording Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Recording Test WS' });
    workspaceId = ws.id;

    const song = await createTestSong(workspaceId, admin.token, { title: 'Recorded Song', artist: 'Artist' });
    songId = song.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/recordings/workspace/:workspaceId', () => {
    it('should create a recording', async () => {
      const res = await request(app)
        .post(`/api/recordings/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          songId,
          title: 'Live at The Venue',
          url: 'https://res.cloudinary.com/test/video/upload/v1/test.mp3',
          type: 'audio',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Live at The Venue');

      recordingId = res.body.id;
    });
  });

  describe('GET /api/recordings/workspace/:workspaceId', () => {
    it('should return all recordings', async () => {
      const res = await request(app)
        .get(`/api/recordings/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /api/recordings/song/:songId', () => {
    it('should return recordings for a song', async () => {
      const res = await request(app)
        .get(`/api/recordings/song/${songId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('PUT /api/recordings/:recordingId', () => {
    it('should update a recording', async () => {
      const res = await request(app)
        .put(`/api/recordings/${recordingId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Updated Recording' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Recording');
    });
  });

  describe('DELETE /api/recordings/:recordingId', () => {
    it('should delete a recording', async () => {
      const res = await request(app)
        .delete(`/api/recordings/${recordingId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
