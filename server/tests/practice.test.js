import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Practice API', () => {
  let admin;
  let workspaceId, songId;
  let sessionId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Practice Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Practice Test WS' });
    workspaceId = ws.id;

    const song = await createTestSong(workspaceId, admin.token, { title: 'Practice Song', artist: 'Artist' });
    songId = song.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/practice/workspace/:workspaceId', () => {
    it('should log a practice session', async () => {
      const res = await request(app)
        .post(`/api/practice/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          songId,
          duration: 30,
          notes: 'Worked on the solo section',
        });

      expect(res.status).toBe(201);
      expect(res.body.duration).toBe(30);

      sessionId = res.body.id;
    });

    it('should reject duration over 480 minutes', async () => {
      const res = await request(app)
        .post(`/api/practice/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId, duration: 500 });

      expect(res.status).toBe(400);
    });

    it('should reject duration under 1 minute', async () => {
      const res = await request(app)
        .post(`/api/practice/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songId, duration: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/practice/workspace/:workspaceId/me', () => {
    it('should return practice sessions', async () => {
      const res = await request(app)
        .get(`/api/practice/workspace/${workspaceId}/me`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toBeDefined();
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/practice/workspace/:workspaceId/summary', () => {
    it('should return practice summary', async () => {
      const res = await request(app)
        .get(`/api/practice/workspace/${workspaceId}/summary`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalMinutes).toBeDefined();
    });
  });

  describe('DELETE /api/practice/:sessionId', () => {
    it('should delete a practice session', async () => {
      const res = await request(app)
        .delete(`/api/practice/${sessionId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
