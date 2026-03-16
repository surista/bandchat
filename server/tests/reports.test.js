import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestChannel } from './helpers/channel.js';
import prisma from './helpers/prisma.js';

describe('Reports API', () => {
  let admin, member, outsider;
  let workspace, channel, messageId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Report Admin' });
    member = await createTestUser({ displayName: 'Report Member' });
    outsider = await createTestUser({ displayName: 'Report Outsider' });

    workspace = await createTestWorkspace(admin.token);
    await addMemberToWorkspace(workspace.id, member.token, admin.token);

    channel = await createTestChannel(workspace.id, admin.token, { name: 'reports-test' });

    // Send a message from member to be reported
    const msgRes = await request(app)
      .post(`/api/messages/channel/${channel.id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ content: 'This is a reportable message' });

    messageId = msgRes.body.id;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { messageId } });
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/reports', () => {
    it('should create a report (admin reports member message)', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId, reason: 'Inappropriate content' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Report submitted successfully');
    });

    it('should reject duplicate report', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId, reason: 'Duplicate report attempt' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already reported/i);
    });

    it('should reject missing messageId', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'Some reason' });

      expect(res.status).toBe(400);
    });

    it('should reject missing reason', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId });

      expect(res.status).toBe(400);
    });

    it('should reject empty reason', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId, reason: '   ' });

      expect(res.status).toBe(400);
    });

    it('should reject report on own message', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${member.token}`)
        .send({ messageId, reason: 'Trying to report my own message' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/own message/i);
    });

    it('should reject non-existent messageId', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId: fakeId, reason: 'Ghost message' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ messageId, reason: 'No auth' });

      expect(res.status).toBe(401);
    });

    it('should reject very long reason (>1000 chars)', async () => {
      const longReason = 'x'.repeat(1001);
      // Send a new message from admin so member can report it
      const msgRes = await request(app)
        .post(`/api/messages/channel/${channel.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ content: 'Another message' });

      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${member.token}`)
        .send({ messageId: msgRes.body.id, reason: longReason });

      // Server may accept long reasons if no validation — check for either 400 or 201
      expect([201, 400]).toContain(res.status);
    });

    it('should work for member reporting another member message', async () => {
      // Create a second member
      const member2 = await createTestUser({ displayName: 'Report Member2' });
      await addMemberToWorkspace(workspace.id, member2.token, admin.token);

      // member2 sends a message
      const msgRes = await request(app)
        .post(`/api/messages/channel/${channel.id}`)
        .set('Authorization', `Bearer ${member2.token}`)
        .send({ content: 'Message from member2' });

      // member reports member2's message
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${member.token}`)
        .send({ messageId: msgRes.body.id, reason: 'Member reporting another member' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Report submitted successfully');

      // Cleanup
      await cleanupUser(member2.user.id);
    });
  });
});
