import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Polls API', () => {
  let admin, member;
  let workspaceId;
  let pollId, optionIds;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Poll Admin' });
    member = await createTestUser({ displayName: 'Poll Member' });

    const ws = await createTestWorkspace(admin.token, { name: 'Poll Test WS' });
    workspaceId = ws.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/polls/workspace/:workspaceId', () => {
    it('should create a poll', async () => {
      const res = await request(app)
        .post(`/api/polls/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          question: 'What songs should we add next?',
          options: ['Sweet Child O Mine', 'Purple Rain', 'Wonderwall'],
          allowMultiple: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.question).toBe('What songs should we add next?');
      expect(res.body.options.length).toBe(3);

      pollId = res.body.id;
      optionIds = res.body.options.map(o => o.id);
    });

    it('should reject poll with less than 2 options', async () => {
      const res = await request(app)
        .post(`/api/polls/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ question: 'Bad poll', options: ['Only one'] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/polls/workspace/:workspaceId', () => {
    it('should return polls', async () => {
      const res = await request(app)
        .get(`/api/polls/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/polls/:pollId', () => {
    it('should return poll details', async () => {
      const res = await request(app)
        .get(`/api/polls/${pollId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.question).toBe('What songs should we add next?');
    });
  });

  describe('POST /api/polls/:pollId/vote', () => {
    it('should vote on a poll', async () => {
      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ optionIds: [optionIds[0]] });

      expect(res.status).toBe(200);
    });

    it('should change vote', async () => {
      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ optionIds: [optionIds[1]] });

      expect(res.status).toBe(200);
    });

    it('admin should also vote', async () => {
      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ optionIds: [optionIds[0]] });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/polls/:pollId/close', () => {
    it('should close a poll (creator)', async () => {
      const res = await request(app)
        .post(`/api/polls/${pollId}/close`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should reject voting on closed poll', async () => {
      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ optionIds: [optionIds[2]] });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/polls/:pollId', () => {
    it('should delete a poll', async () => {
      const res = await request(app)
        .delete(`/api/polls/${pollId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
