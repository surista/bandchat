import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Channels API', () => {
  let admin, member, outsider;
  let workspaceId;
  let channelId, privateChannelId, dmChannelId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Chan Admin' });
    member = await createTestUser({ displayName: 'Chan Member' });
    outsider = await createTestUser({ displayName: 'Chan Outsider' });

    const ws = await createTestWorkspace(admin.token, { name: 'Channel Test WS' });
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

  // ── Create Channel ──

  describe('POST /api/channels/workspace/:workspaceId', () => {
    it('should create a public channel', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'test-channel' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('test-channel');
      expect(res.body.isPrivate).toBe(false);

      channelId = res.body.id;
    });

    it('should create a private channel', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'private-channel', isPrivate: true });

      expect(res.status).toBe(201);
      expect(res.body.isPrivate).toBe(true);

      privateChannelId = res.body.id;
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ name: 'hacked-channel' });

      expect(res.status).toBe(403);
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── Get Channels ──

  describe('GET /api/channels/workspace/:workspaceId', () => {
    it('should return channels for workspace member', async () => {
      const res = await request(app)
        .get(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should include general + our test channels
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Get Channel ──

  describe('GET /api/channels/:channelId', () => {
    it('should return channel details', async () => {
      const res = await request(app)
        .get(`/api/channels/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test-channel');
    });
  });

  // ── Update Channel ──

  describe('PUT /api/channels/:channelId', () => {
    it('should update channel name', async () => {
      const res = await request(app)
        .put(`/api/channels/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'renamed-channel' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('renamed-channel');
    });
  });

  // ── Channel Members ──

  describe('Channel member management', () => {
    it('should add member to private channel', async () => {
      const res = await request(app)
        .post(`/api/channels/${privateChannelId}/members`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: member.user.id });

      expect(res.status).toBe(201);
    });

    it('should remove member from private channel', async () => {
      const res = await request(app)
        .delete(`/api/channels/${privateChannelId}/members/${member.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── Mute ──

  describe('PUT /api/channels/:channelId/mute', () => {
    it('should mute a channel', async () => {
      const res = await request(app)
        .put(`/api/channels/${channelId}/mute`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ muted: true });

      expect(res.status).toBe(200);
    });

    it('should unmute a channel', async () => {
      const res = await request(app)
        .put(`/api/channels/${channelId}/mute`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ muted: false });

      expect(res.status).toBe(200);
    });
  });

  // ── Mark as Read ──

  describe('POST /api/channels/:channelId/read', () => {
    it('should mark channel as read', async () => {
      const res = await request(app)
        .post(`/api/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ── DMs ──

  describe('DM channels', () => {
    it('should create a DM', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}/dm`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userIds: [member.user.id] });

      expect(res.status).toBe(200);
      expect(res.body.isDirect).toBe(true);

      dmChannelId = res.body.id;
    });

    it('should return same DM on duplicate request', async () => {
      const res = await request(app)
        .post(`/api/channels/workspace/${workspaceId}/dm`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userIds: [member.user.id] });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dmChannelId);
    });

    it('should get DMs list', async () => {
      const res = await request(app)
        .get(`/api/channels/workspace/${workspaceId}/dms`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Delete Channel ──

  describe('DELETE /api/channels/:channelId', () => {
    it('should delete channel (admin)', async () => {
      const res = await request(app)
        .delete(`/api/channels/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should not delete general channel', async () => {
      // Find the general channel
      const channels = await request(app)
        .get(`/api/channels/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const general = channels.body.find(c => c.name === 'general');
      if (general) {
        const res = await request(app)
          .delete(`/api/channels/${general.id}`)
          .set('Authorization', `Bearer ${admin.token}`);

        expect(res.status).toBe(400);
      }
    });
  });
});
