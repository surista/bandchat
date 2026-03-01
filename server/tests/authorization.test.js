import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Authorization & Security', () => {
  let admin, outsider;
  let workspaceId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'AuthZ Admin' });
    outsider = await createTestUser({ displayName: 'AuthZ Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'AuthZ Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Unauthenticated requests should return 401 ──

  describe('Unauthenticated requests (401)', () => {
    const protectedRoutes = [
      ['GET', '/api/auth/me'],
      ['GET', '/api/workspaces'],
      ['POST', '/api/workspaces'],
      ['GET', `/api/channels/workspace/fake-id`],
      ['POST', `/api/messages/channel/fake-id`],
      ['GET', `/api/songs/workspace/fake-id`],
      ['GET', `/api/gigs/workspace/fake-id`],
      ['GET', `/api/setlists/workspace/fake-id`],
      ['GET', '/api/blocks'],
      ['GET', `/api/announcements/workspace/fake-id`],
      ['GET', `/api/polls/workspace/fake-id`],
      ['GET', `/api/contacts/workspace/fake-id`],
      ['GET', `/api/kitty/workspace/fake-id`],
      ['GET', `/api/band-members/workspace/fake-id`],
    ];

    for (const [method, path] of protectedRoutes) {
      it(`should reject ${method} ${path}`, async () => {
        const res = await request(app)[method.toLowerCase()](path);
        expect(res.status).toBe(401);
      });
    }
  });

  // ── Non-member access should return 403 ──

  describe('Non-member access (403)', () => {
    it('should reject GET workspace details', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject GET channels', async () => {
      const res = await request(app)
        .get(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject POST song', async () => {
      const res = await request(app)
        .post(`/api/songs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Hacked Song', artist: 'Hacker' });

      expect(res.status).toBe(403);
    });

    it('should reject POST gig', async () => {
      const res = await request(app)
        .post(`/api/gigs/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Hacked Gig', date: new Date().toISOString(), type: 'GIG' });

      expect(res.status).toBe(403);
    });

    it('should reject GET announcements', async () => {
      const res = await request(app)
        .get(`/api/announcements/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject GET kitty', async () => {
      const res = await request(app)
        .get(`/api/kitty/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Invalid token should return 401 ──

  describe('Invalid tokens (401)', () => {
    it('should reject malformed bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer totally.not.a.valid.jwt');

      expect(res.status).toBe(401);
    });

    it('should reject expired-style token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWtlIiwiZXhwIjoxfQ.fake');

      expect(res.status).toBe(401);
    });

    it('should reject missing Authorization header', async () => {
      const res = await request(app)
        .get('/api/workspaces');

      expect(res.status).toBe(401);
    });
  });
});
