import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Push API', () => {
  let admin;
  let workspaceId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Push Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Push Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  // ── VAPID Key ──

  describe('GET /api/push/vapid-key', () => {
    it('should respond with VAPID key or 503 if not configured', async () => {
      const res = await request(app).get('/api/push/vapid-key');

      if (process.env.VAPID_PUBLIC_KEY) {
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('publicKey');
      } else {
        expect(res.status).toBe(503);
      }
    });
  });

  // ── Subscribe ──

  describe('POST /api/push/subscribe', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should reject invalid subscription data', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Unsubscribe ──

  describe('POST /api/push/unsubscribe', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/push/unsubscribe')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  // ── Expo Token ──

  describe('POST /api/push/expo-token', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/push/expo-token')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should reject missing or invalid token', async () => {
      const res = await request(app)
        .post('/api/push/expo-token')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Snooze ──

  describe('POST /api/push/snooze', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/push/snooze')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should set snooze with valid duration', async () => {
      const res = await request(app)
        .post('/api/push/snooze')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ duration: 60 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('snoozedUntil');
      expect(res.body.snoozedUntil).not.toBeNull();
    });
  });

  // ── Snooze Status ──

  describe('GET /api/push/snooze-status', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/push/snooze-status');

      expect(res.status).toBe(401);
    });

    it('should return snooze status', async () => {
      const res = await request(app)
        .get('/api/push/snooze-status')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('snoozedUntil');
    });
  });

  // ── Preferences ──

  describe('GET /api/push/preferences/:workspaceId', () => {
    it('should require authentication', async () => {
      const res = await request(app).get(`/api/push/preferences/${workspaceId}`);

      expect(res.status).toBe(401);
    });

    it('should return preferences for member', async () => {
      const res = await request(app)
        .get(`/api/push/preferences/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifyDMs');
      expect(res.body).toHaveProperty('notifyMentions');
      expect(res.body).toHaveProperty('notifyGigChanges');
      expect(res.body).toHaveProperty('notifyAnnouncements');
      expect(res.body).toHaveProperty('notifyChannelMessages');
    });
  });
});
