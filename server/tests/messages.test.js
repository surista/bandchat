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
});
