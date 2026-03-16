import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Suggestions API', () => {
  let admin, outsider;
  let workspaceId;
  let song1, song2, song3;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Suggestions Admin' });
    outsider = await createTestUser({ displayName: 'Suggestions Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'Suggestions Test WS' });
    workspaceId = ws.id;

    song1 = await createTestSong(workspaceId, admin.token, {
      title: 'Song In C',
      artist: 'Artist A',
      key: 'C',
      tempo: 120,
    });
    song2 = await createTestSong(workspaceId, admin.token, {
      title: 'Song In G',
      artist: 'Artist B',
      key: 'G',
      tempo: 125,
    });
    song3 = await createTestSong(workspaceId, admin.token, {
      title: 'Song In Am',
      artist: 'Artist C',
      key: 'Am',
      tempo: 118,
    });
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Mashups ──

  describe('GET /api/suggestions/workspace/:workspaceId/mashups/:songId', () => {
    it('should return suggestions for a song', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/mashups/${song1.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sourceSong');
      expect(res.body).toHaveProperty('suggestions');
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    });

    it('should return 404 for non-existent song', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/mashups/${fakeId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(404);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/mashups/${song1.id}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Transitions ──

  describe('GET /api/suggestions/workspace/:workspaceId/transitions', () => {
    it('should return transitions for workspace', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/transitions`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('transitions');
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/transitions`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Recommendations ──

  describe('GET /api/suggestions/workspace/:workspaceId/recommendations', () => {
    it('should return recommendations', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/recommendations`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analysis');
      expect(res.body).toHaveProperty('recommendations');
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/suggestions/workspace/${workspaceId}/recommendations`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Optimize Setlist ──

  describe('POST /api/suggestions/workspace/:workspaceId/optimize-setlist', () => {
    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/suggestions/workspace/${workspaceId}/optimize-setlist`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ songIds: [song1.id, song2.id] });

      expect(res.status).toBe(403);
    });
  });
});
