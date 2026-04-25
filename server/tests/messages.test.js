import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Messages API', () => {
  let admin, member, outsider;
  let workspaceId, channelId;
  let messageId, replyId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Msg Admin' });
    member = await createTestUser({ displayName: 'Msg Member' });
    outsider = await createTestUser({ displayName: 'Msg Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'Message Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);

    // Get the general channel
    const channels = await request(app)
      .get(`/api/channels/workspace/${workspaceId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    channelId = channels.body.find(c => c.name === 'general')?.id || channels.body[0]?.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // ── Send Message ──

  describe('POST /api/messages/channel/:channelId', () => {
    it('should send a message', async () => {
      const res = await request(app)
        .post(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ content: 'Hello from tests!' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Hello from tests!');
      expect(res.body.authorId).toBe(admin.user.id);

      messageId = res.body.id;
    });

    it('should send a message as member', async () => {
      const res = await request(app)
        .post(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ content: 'Member message' });

      expect(res.status).toBe(201);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ content: 'Hacked message' });

      expect(res.status).toBe(403);
    });

    it('should reject empty content', async () => {
      const res = await request(app)
        .post(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── Get Messages ──

  describe('GET /api/messages/channel/:channelId', () => {
    it('should get messages for channel', async () => {
      const res = await request(app)
        .get(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Thread Replies ──

  describe('Thread replies', () => {
    it('should create a thread reply', async () => {
      const res = await request(app)
        .post(`/api/messages/channel/${channelId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ content: 'Thread reply', parentId: messageId });

      expect(res.status).toBe(201);
      expect(res.body.parentId).toBe(messageId);

      replyId = res.body.id;
    });

    it('should get thread replies', async () => {
      const res = await request(app)
        .get(`/api/messages/${messageId}/replies`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.replies)).toBe(true);
      expect(res.body.replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Edit Message ──

  describe('PUT /api/messages/:messageId', () => {
    it('should edit own message', async () => {
      const res = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ content: 'Edited message' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Edited message');
    });

    it("should reject editing someone else's message", async () => {
      const res = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ content: 'Hacked edit' });

      expect(res.status).toBe(403);
    });
  });

  // ── Reactions ──

  describe('Reactions', () => {
    it('should add a reaction', async () => {
      const res = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ emoji: '👍' });

      expect(res.status).toBe(201);
    });

    it('should remove a reaction', async () => {
      const res = await request(app)
        .delete(`/api/messages/${messageId}/reactions/👍`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Pin/Unpin ──

  describe('Pin messages', () => {
    it('should pin a message', async () => {
      const res = await request(app)
        .post(`/api/messages/${messageId}/pin`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(201);
    });

    it('should get pinned messages', async () => {
      const res = await request(app)
        .get(`/api/messages/channel/${channelId}/pins`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should unpin a message', async () => {
      const res = await request(app)
        .delete(`/api/messages/${messageId}/pin`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Search ──

  describe('GET /api/messages/search/:workspaceId', () => {
    it('should search messages', async () => {
      const res = await request(app)
        .get(`/api/messages/search/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ q: 'Edited' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject short query', async () => {
      const res = await request(app)
        .get(`/api/messages/search/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ q: 'a' });

      expect(res.status).toBe(400);
    });
  });

  // ── Seen By ──

  describe('GET /api/messages/:messageId/seen-by', () => {
    it('should get seen-by list', async () => {
      // First mark channel as read
      await request(app)
        .post(`/api/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${admin.token}`);

      const res = await request(app)
        .get(`/api/messages/${messageId}/seen-by`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.seenBy)).toBe(true);
    });
  });

  // ── Delete Message ──

  describe('DELETE /api/messages/:messageId', () => {
    it("should reject deleting someone else's message (non-admin)", async () => {
      const res = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(403);
    });

    it('should delete own message', async () => {
      const res = await request(app)
        .delete(`/api/messages/${replyId}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
    });

    it('should delete message as admin', async () => {
      const res = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Pagination ──
  // Regression coverage for the 2026-04-25 incident, where scroll-up to load
  // older messages had been silently broken since v1.05.77 (2026-03-24). The
  // cursor validator rejected anything outside 20–30 chars as "Invalid cursor"
  // — but Message IDs are 36-char UUIDs, so every paginated request returned
  // 400. The client caught the error in a silent try/catch, no toast, no
  // visible failure: it just looked like "channel only has the most recent 50
  // messages." A single end-to-end pagination walk would have caught this.
  describe('GET /api/messages/channel/:channelId — pagination', () => {
    let pagAdmin;
    let pagWorkspaceId;
    let pagChannelId;
    const SEED_COUNT = 65;
    const PAGE_LIMIT = 50;
    const seededIds = [];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    beforeAll(async () => {
      pagAdmin = await createTestUser({ displayName: 'Pagination Admin' });
      const ws = await createTestWorkspace(pagAdmin.token, { name: 'Pagination Test WS' });
      pagWorkspaceId = ws.id;

      const channels = await request(app)
        .get(`/api/channels/workspace/${pagWorkspaceId}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);
      pagChannelId = channels.body.find(c => c.name === 'general')?.id || channels.body[0]?.id;

      // Seed 65 messages — enough to span > one page (50). Tiny delay between
      // sends so createdAt stays strictly monotonic; the handler orders by
      // createdAt desc and ties make pagination tests flaky.
      for (let i = 0; i < SEED_COUNT; i++) {
        const res = await request(app)
          .post(`/api/messages/channel/${pagChannelId}`)
          .set('Authorization', `Bearer ${pagAdmin.token}`)
          .send({ content: `pag-seed-${i}` });
        expect(res.status).toBe(201);
        seededIds.push(res.body.id);
        await new Promise(r => setTimeout(r, 2));
      }
    });

    afterAll(async () => {
      await cleanupWorkspace(pagWorkspaceId);
      await cleanupUser(pagAdmin.user.id);
    });

    it('initial page returns latest LIMIT messages with hasMore=true and a UUID nextCursor', async () => {
      const res = await request(app)
        .get(`/api/messages/channel/${pagChannelId}?limit=${PAGE_LIMIT}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages).toHaveLength(PAGE_LIMIT);
      expect(res.body.hasMore).toBe(true);
      // Direct regression for the v1.05.77 defect: the cursor returned by the
      // server MUST itself be a valid UUID so that the client can use it on
      // the next request without the validator rejecting it.
      expect(typeof res.body.nextCursor).toBe('string');
      expect(res.body.nextCursor).toMatch(UUID_RE);
    });

    it('walking the cursor surfaces every seeded message exactly once across all pages', async () => {
      // The original bug presented as "channel only ever shows ~50 messages."
      // This test walks every page until hasMore=false and asserts that the
      // union of returned IDs equals the full set of seeded IDs. If any cursor
      // is rejected (400), or any page is dropped, or the walk loops, this
      // fails — covering the full scroll-back integration path on the server.
      const seen = new Set();
      let cursor = null;
      let pages = 0;
      const MAX_PAGES = 10; // ceil(65/50)+1 = 3 expected; cap prevents loops

      while (pages++ < MAX_PAGES) {
        const url = `/api/messages/channel/${pagChannelId}?limit=${PAGE_LIMIT}` +
          (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const res = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${pagAdmin.token}`);

        expect(res.status).toBe(200);
        for (const m of res.body.messages) seen.add(m.id);

        if (!res.body.hasMore) {
          expect(res.body.nextCursor).toBeNull();
          break;
        }
        expect(res.body.nextCursor).toMatch(UUID_RE);
        cursor = res.body.nextCursor;
      }

      expect(seen.size).toBe(seededIds.length);
      for (const id of seededIds) {
        expect(seen.has(id)).toBe(true);
      }
    });

    it('rejects a non-UUID cursor with 400', async () => {
      const res = await request(app)
        .get(`/api/messages/channel/${pagChannelId}?cursor=not-a-uuid`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cursor/i);
    });

    it('accepts a cursor that is a valid UUID (does not reject by length)', async () => {
      // Belt-and-suspenders: verify a freshly-issued nextCursor doesn't trip
      // the validator on the very next request. The original bug was a length
      // check 20–30 chars that rejected all 36-char UUIDs.
      const first = await request(app)
        .get(`/api/messages/channel/${pagChannelId}?limit=${PAGE_LIMIT}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);
      expect(first.status).toBe(200);
      expect(first.body.nextCursor).toMatch(UUID_RE);

      const second = await request(app)
        .get(`/api/messages/channel/${pagChannelId}?limit=${PAGE_LIMIT}&cursor=${first.body.nextCursor}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);
      expect(second.status).toBe(200);
    });

    it('returns hasMore=false and nextCursor=null when channel has fewer than limit messages', async () => {
      const ws2 = await createTestWorkspace(pagAdmin.token, { name: 'Small Pagination WS' });
      const channels2 = await request(app)
        .get(`/api/channels/workspace/${ws2.id}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);
      const ch2 = channels2.body.find(c => c.name === 'general')?.id || channels2.body[0]?.id;

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/messages/channel/${ch2}`)
          .set('Authorization', `Bearer ${pagAdmin.token}`)
          .send({ content: `small-${i}` });
      }

      const res = await request(app)
        .get(`/api/messages/channel/${ch2}?limit=${PAGE_LIMIT}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(5);
      expect(res.body.hasMore).toBe(false);
      expect(res.body.nextCursor).toBeNull();

      await cleanupWorkspace(ws2.id);
    });

    it('sets Cache-Control: no-store on every response (prevents 304 cache poisoning)', async () => {
      // Regression for the 2026-04-25 incident: during a 429 storm the browser
      // cached an empty `{messages:[],hasMore:false}` body with an ETag. Once
      // cached, every subsequent request got 304 Not Modified and the client
      // permanently believed the channel had no messages to load.
      const res = await request(app)
        .get(`/api/messages/channel/${pagChannelId}?limit=${PAGE_LIMIT}`)
        .set('Authorization', `Bearer ${pagAdmin.token}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });
  });
});
