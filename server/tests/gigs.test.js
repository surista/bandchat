import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong, createTestSetlist } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Gigs API', () => {
  let admin, member;
  let workspaceId;
  let gigId, rehearsalId, setlistId, songId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Gig Admin' });
    member = await createTestUser({ displayName: 'Gig Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Gig Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);

    // Create a song and setlist for gig tests
    const song = await createTestSong(workspaceId, admin.token, { title: 'Gig Song', artist: 'Gig Artist' });
    songId = song.id;

    const sl = await createTestSetlist(workspaceId, admin.token, { name: 'Gig Setlist' });
    setlistId = sl.id;

    // Add song to setlist
    await request(app)
      .post(`/api/setlists/${setlistId}/songs`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ songId });
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  // ── Create Gig ──

  describe('POST /api/gigs/workspace/:workspaceId', () => {
    it('should create a gig', async () => {
      const res = await request(app)
        .post(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Friday Night at The Venue',
          date: new Date(Date.now() + 7 * 86400000).toISOString(),
          type: 'GIG',
          venue: 'The Venue',
          pay: 500,
          notes: 'Load in at 6pm',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Friday Night at The Venue');
      expect(res.body.venue).toBe('The Venue');
      expect(res.body.type).toBe('GIG');

      gigId = res.body.id;
    });

    it('should create a rehearsal', async () => {
      const res = await request(app)
        .post(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          title: 'Weekly Rehearsal',
          date: new Date(Date.now() + 3 * 86400000).toISOString(),
          type: 'REHEARSAL',
          venue: 'Practice Room',
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('REHEARSAL');

      rehearsalId = res.body.id;
    });

    it('should reject missing title', async () => {
      const res = await request(app)
        .post(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          date: new Date().toISOString(),
          type: 'GIG',
        });

      expect(res.status).toBe(400);
    });
  });

  // ── Get Gigs ──

  describe('GET /api/gigs/workspace/:workspaceId', () => {
    it('should return all gigs', async () => {
      const res = await request(app)
        .get(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should filter by type', async () => {
      const res = await request(app)
        .get(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ type: 'REHEARSAL' });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].type).toBe('REHEARSAL');
    });
  });

  // ── Get Single Gig ──

  describe('GET /api/gigs/:gigId', () => {
    it('should return gig details', async () => {
      const res = await request(app)
        .get(`/api/gigs/${gigId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Friday Night at The Venue');
    });
  });

  // ── Update Gig ──

  describe('PUT /api/gigs/:gigId', () => {
    it('should update a gig', async () => {
      const res = await request(app)
        .put(`/api/gigs/${gigId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ pay: 750, notes: 'Updated pay' });

      expect(res.status).toBe(200);
      expect(res.body.pay).toBe(750);
    });
  });

  // ── Attach Setlist to Gig ──

  describe('Gig setlists', () => {
    let gigSetlistId;

    it('should add a setlist to a gig', async () => {
      const res = await request(app)
        .post(`/api/gigs/${gigId}/setlists`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ setlistId });

      expect(res.status).toBe(201);
      gigSetlistId = res.body.id;
    });

    it('should remove setlist from gig', async () => {
      const res = await request(app)
        .delete(`/api/gigs/${gigId}/setlists/${gigSetlistId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Complete Gig ──

  describe('PUT /api/gigs/:gigId/complete', () => {
    it('should mark gig as complete', async () => {
      const res = await request(app)
        .put(`/api/gigs/${gigId}/complete`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ songsPlayed: [songId] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  // ── Stats ──

  describe('GET /api/gigs/workspace/:workspaceId/stats', () => {
    it('should return gig stats', async () => {
      const res = await request(app)
        .get(`/api/gigs/workspace/${workspaceId}/stats`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.totalGigs).toBeDefined();
      expect(res.body.totalRevenue).toBeDefined();
      expect(res.body.currency).toBeDefined();
    });
  });

  // ── Duplicate Gig ──

  describe('POST /api/gigs/:gigId/duplicate', () => {
    it('should duplicate a gig', async () => {
      const res = await request(app)
        .post(`/api/gigs/${rehearsalId}/duplicate`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(201);
      expect(res.body.title).toContain('Weekly Rehearsal');
    });
  });

  // ── Delete Gig ──

  describe('DELETE /api/gigs/:gigId', () => {
    it('should delete a gig', async () => {
      const res = await request(app)
        .delete(`/api/gigs/${rehearsalId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Cross-workspace gigs ──

  describe('GET /api/gigs/all-workspaces', () => {
    it('should return gigs across all workspaces', async () => {
      const res = await request(app)
        .get('/api/gigs/all-workspaces')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
