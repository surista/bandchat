import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestChannel } from './helpers/channel.js';
import prisma from './helpers/prisma.js';

describe('Channel Groups API', () => {
  let admin, member;
  let workspaceId;
  let groupId, channelId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'CG Admin' });
    member = await createTestUser({ displayName: 'CG Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'ChanGroup Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);

    const ch = await createTestChannel(workspaceId, admin.token, { name: 'group-test-chan' });
    channelId = ch.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/channel-groups/workspace/:workspaceId', () => {
    it('should create a channel group (admin)', async () => {
      const res = await request(app)
        .post(`/api/channel-groups/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Music Channels' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Music Channels');

      groupId = res.body.id;
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .post(`/api/channel-groups/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ name: 'Hacked Group' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/channel-groups/workspace/:workspaceId', () => {
    it('should return channel groups', async () => {
      const res = await request(app)
        .get(`/api/channel-groups/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PUT /api/channel-groups/:groupId', () => {
    it('should update a channel group', async () => {
      const res = await request(app)
        .put(`/api/channel-groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Band Channels' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Band Channels');
    });
  });

  describe('PUT /api/channel-groups/:groupId/channels/:channelId', () => {
    it('should move channel into group', async () => {
      const res = await request(app)
        .put(`/api/channel-groups/${groupId}/channels/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/channel-groups/channels/:channelId', () => {
    it('should remove channel from group', async () => {
      const res = await request(app)
        .delete(`/api/channel-groups/channels/${channelId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/channel-groups/workspace/:workspaceId/reorder', () => {
    it('should reorder groups', async () => {
      const res = await request(app)
        .put(`/api/channel-groups/workspace/${workspaceId}/reorder`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ groupIds: [groupId] });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/channel-groups/:groupId', () => {
    it('should delete a channel group', async () => {
      const res = await request(app)
        .delete(`/api/channel-groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
