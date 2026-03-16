import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser, loginUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestChannel } from './helpers/channel.js';
import prisma from './helpers/prisma.js';

/**
 * App Store / Google Play Compliance Test Suite
 *
 * These tests verify BandChat meets store review requirements.
 * A failure here is an immediate signal that a submission could be rejected.
 */
describe('Store Compliance', () => {
  // Shared fixtures
  let admin, member;
  let workspace, channel;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Compliance Admin' });
    member = await createTestUser({ displayName: 'Compliance Member' });
    workspace = await createTestWorkspace(admin.token);
    await addMemberToWorkspace(workspace.id, member.token, admin.token);
    channel = await createTestChannel(workspace.id, admin.token, { name: 'compliance-test' });
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await prisma.$disconnect();
  });

  // ─────────────────────────────────────────────────────
  // Apple 5.1.1(v) — Account Deletion
  // ─────────────────────────────────────────────────────
  describe('Apple 5.1.1(v) — Account Deletion', () => {
    let deletionUser;

    beforeAll(async () => {
      deletionUser = await createTestUser({ displayName: 'Deletion Test User' });
    });

    afterAll(async () => {
      // Restore soft-deleted user so cleanupUser can hard-delete
      try {
        await prisma.user.update({
          where: { id: deletionUser.user.id },
          data: { deletedAt: null },
        });
      } catch {
        // May already be cleaned up
      }
      await cleanupUser(deletionUser.user.id);
    });

    it('Apple 5.1.1(v): account deletion sets deletedAt', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${deletionUser.token}`)
        .send({ password: deletionUser.password });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deletion/i);

      // Verify deletedAt was set in the database
      const user = await prisma.user.findFirst({
        where: { id: deletionUser.user.id, deletedAt: { not: null } },
      });
      expect(user).not.toBeNull();
      expect(user.deletedAt).toBeTruthy();
    });

    it('Apple 5.1.1(v): deleted user cannot login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: deletionUser.email, password: deletionUser.password });

      expect(res.status).toBe(401);
    });

    it('Apple 5.1.1(v): deleted user cannot access /me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${deletionUser.token}`);

      expect(res.status).toBe(401);
    });

    it('Apple 5.1.1(v): account deletion without password returns 400', async () => {
      const pwUser = await createTestUser({ displayName: 'No Password Provided' });

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${pwUser.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/password/i);

      await cleanupUser(pwUser.user.id);
    });

    it('Apple 5.1.1(v): account deletion with wrong password returns 401', async () => {
      const wrongPwUser = await createTestUser({ displayName: 'Wrong Password' });

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${wrongPwUser.token}`)
        .send({ password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/incorrect/i);

      await cleanupUser(wrongPwUser.user.id);
    });

    it('Apple 5.1.1(v): OAuth-only user can delete without password', async () => {
      const oauthUser = await createTestUser({ displayName: 'OAuth User' });

      // Convert to OAuth-only user (no password)
      await prisma.user.update({
        where: { id: oauthUser.user.id },
        data: { password: null, authProvider: 'google', googleId: 'test-google-id' },
      });

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${oauthUser.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deletion/i);

      // Restore for cleanup
      await prisma.user.update({
        where: { id: oauthUser.user.id },
        data: { deletedAt: null },
      });
      await cleanupUser(oauthUser.user.id);
    });

    it('Apple 5.1.1(v): sole admin of workspace cannot delete account', async () => {
      const soleAdmin = await createTestUser({ displayName: 'Sole Admin' });
      const soleAdminWs = await createTestWorkspace(soleAdmin.token, { name: 'Sole Admin Band' });

      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${soleAdmin.token}`)
        .send({ password: soleAdmin.password });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/admin/i);
      expect(res.body.workspaces).toContain('Sole Admin Band');

      await cleanupWorkspace(soleAdminWs.id);
      await cleanupUser(soleAdmin.user.id);
    });
  });

  // ─────────────────────────────────────────────────────
  // Apple 1.2 / Google — Content Reporting
  // ─────────────────────────────────────────────────────
  describe('Apple 1.2 / Google — Content Reporting', () => {
    let messageId;

    beforeAll(async () => {
      // Member sends a message, admin will report it
      const msgRes = await request(app)
        .post(`/api/messages/channel/${channel.id}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({ content: 'This is a reportable message' });

      messageId = msgRes.body.id;
    });

    it('Apple 1.2: report a message with valid reason returns 201', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId, reason: 'Inappropriate content' });

      expect(res.status).toBe(201);
    });

    it('Apple 1.2: duplicate report returns 409', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId, reason: 'Inappropriate content again' });

      expect(res.status).toBe(409);
    });

    it('Apple 1.2: report requires authentication', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ messageId, reason: 'Spam' });

      expect(res.status).toBe(401);
    });

    it('Apple 1.2: report with missing reason returns 400', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ messageId });

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────
  // Apple 1.2 / Google — User Blocking
  // ─────────────────────────────────────────────────────
  describe('Apple 1.2 / Google — User Blocking', () => {
    let blockUser, blockTarget;

    beforeAll(async () => {
      blockUser = await createTestUser({ displayName: 'Block Tester' });
      blockTarget = await createTestUser({ displayName: 'Block Target' });
    });

    afterAll(async () => {
      await cleanupUser(blockUser.user.id);
      await cleanupUser(blockTarget.user.id);
    });

    it('Apple 1.2: block a user returns 201', async () => {
      const res = await request(app)
        .post('/api/blocks')
        .set('Authorization', `Bearer ${blockUser.token}`)
        .send({ blockedUserId: blockTarget.user.id });

      expect(res.status).toBe(201);
    });

    it('Apple 1.2: blocked users list includes blocked user', async () => {
      const res = await request(app)
        .get('/api/blocks')
        .set('Authorization', `Bearer ${blockUser.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const blockedIds = res.body.map((b) => b.blockedUserId);
      expect(blockedIds).toContain(blockTarget.user.id);
    });

    it('Apple 1.2: unblock a user returns 200', async () => {
      const res = await request(app)
        .delete(`/api/blocks/${blockTarget.user.id}`)
        .set('Authorization', `Bearer ${blockUser.token}`);

      expect(res.status).toBe(200);
    });

    it('Apple 1.2: cannot block self returns 400', async () => {
      const res = await request(app)
        .post('/api/blocks')
        .set('Authorization', `Bearer ${blockUser.token}`)
        .send({ blockedUserId: blockUser.user.id });

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────
  // Apple 5.6.1 — Privacy & Data Export
  // ─────────────────────────────────────────────────────
  describe('Apple 5.6.1 — Privacy & Data Export', () => {
    it('Apple 5.6.1: data export returns 200 with user data', async () => {
      const res = await request(app)
        .get('/api/auth/export')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.exportDate).toBeDefined();
      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.email).toBe(admin.email);
    });

    it('Apple 5.6.1: data export includes messages', async () => {
      const res = await request(app)
        .get('/api/auth/export')
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(Array.isArray(res.body.messages)).toBe(true);
    });

    it('Apple 5.6.1: data export requires authentication', async () => {
      const res = await request(app)
        .get('/api/auth/export');

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────
  // Apple 3.1.1 — Subscription Webhooks (RevenueCat)
  // ─────────────────────────────────────────────────────
  describe('Apple 3.1.1 — Subscription Webhooks', () => {
    let webhookWorkspace;
    const webhookSecret = 'test-webhook-secret';
    let savedSecret;

    beforeAll(async () => {
      webhookWorkspace = await createTestWorkspace(admin.token, { name: 'Webhook Test Band' });
      // Set workspace to FREE before testing activation
      await prisma.workspace.update({
        where: { id: webhookWorkspace.id },
        data: { plan: 'FREE', planSource: 'MANUAL' },
      });
      savedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
      process.env.REVENUECAT_WEBHOOK_SECRET = webhookSecret;
    });

    afterAll(async () => {
      process.env.REVENUECAT_WEBHOOK_SECRET = savedSecret;
      await cleanupWorkspace(webhookWorkspace.id);
    });

    it('Apple 3.1.1: INITIAL_PURCHASE activates PRO plan', async () => {
      const res = await request(app)
        .post('/api/subscriptions/webhooks/revenuecat')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
            subscriber_attributes: {
              workspaceId: { $value: webhookWorkspace.id },
            },
          },
        });

      expect(res.status).toBe(200);

      // Wait briefly for async processing after the 200 response
      await new Promise((resolve) => setTimeout(resolve, 500));

      const ws = await prisma.workspace.findUnique({
        where: { id: webhookWorkspace.id },
        select: { plan: true },
      });
      expect(ws.plan).toBe('PRO');
    });

    it('Apple 3.1.1: EXPIRATION reverts to FREE plan', async () => {
      const res = await request(app)
        .post('/api/subscriptions/webhooks/revenuecat')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          event: {
            type: 'EXPIRATION',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            subscriber_attributes: {
              workspaceId: { $value: webhookWorkspace.id },
            },
          },
        });

      expect(res.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const ws = await prisma.workspace.findUnique({
        where: { id: webhookWorkspace.id },
        select: { plan: true },
      });
      expect(ws.plan).toBe('FREE');
    });

    it('Apple 3.1.1: invalid auth header returns 401', async () => {
      const res = await request(app)
        .post('/api/subscriptions/webhooks/revenuecat')
        .set('Authorization', 'Bearer wrong-secret')
        .send({
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            subscriber_attributes: {
              workspaceId: { $value: webhookWorkspace.id },
            },
          },
        });

      expect(res.status).toBe(401);
    });

    it('Apple 3.1.1: missing workspaceId in subscriber_attributes returns 200 (skipped gracefully)', async () => {
      const res = await request(app)
        .post('/api/subscriptions/webhooks/revenuecat')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            subscriber_attributes: {},
          },
        });

      expect(res.status).toBe(200);
    });

    it('Apple 3.1.1: webhook with no secret configured returns 503', async () => {
      const currentSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
      delete process.env.REVENUECAT_WEBHOOK_SECRET;

      const res = await request(app)
        .post('/api/subscriptions/webhooks/revenuecat')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            subscriber_attributes: {
              workspaceId: { $value: webhookWorkspace.id },
            },
          },
        });

      expect(res.status).toBe(503);

      // Restore secret for any subsequent tests
      process.env.REVENUECAT_WEBHOOK_SECRET = currentSecret;
    });
  });

  // ─────────────────────────────────────────────────────
  // Google — Data Minimization
  // ─────────────────────────────────────────────────────
  describe('Google — Data Minimization', () => {
    it('Google: new user record contains only provided fields', async () => {
      const minUser = await createTestUser({ displayName: 'Minimal User' });

      const dbUser = await prisma.user.findUnique({
        where: { id: minUser.user.id },
      });

      // Fields that should be populated from signup
      expect(dbUser.email).toBe(minUser.email);
      expect(dbUser.displayName).toBe('Minimal User');
      expect(dbUser.password).toBeTruthy(); // hashed password
      expect(dbUser.authProvider).toBe('local');

      // Fields that should NOT be populated on a fresh user
      expect(dbUser.avatarUrl).toBeNull();
      expect(dbUser.bio).toBeNull();
      expect(dbUser.googleId).toBeNull();
      expect(dbUser.appleId).toBeNull();
      expect(dbUser.deletedAt).toBeNull();
      expect(dbUser.isSystemAdmin).toBe(false);
      expect(dbUser.notificationsSnoozedUntil).toBeNull();

      await cleanupUser(minUser.user.id);
    });

    it('Google: no unexpected tracking fields on fresh signup', async () => {
      const trackUser = await createTestUser({ displayName: 'Track Check User' });

      const dbUser = await prisma.user.findUnique({
        where: { id: trackUser.user.id },
      });

      // Ensure no fields exist beyond what the schema defines
      const expectedKeys = [
        'id', 'email', 'password', 'displayName', 'avatarUrl', 'bio',
        'emailVerified', 'verificationToken', 'verificationExpires',
        'pendingEmail', 'passwordResetToken', 'passwordResetExpires',
        'googleId', 'appleId', 'authProvider', 'isSystemAdmin',
        'notificationsSnoozedUntil', 'deletedAt', 'createdAt', 'updatedAt',
      ];
      const actualKeys = Object.keys(dbUser);
      const unexpectedKeys = actualKeys.filter((k) => !expectedKeys.includes(k));

      expect(unexpectedKeys).toEqual([]);

      await cleanupUser(trackUser.user.id);
    });
  });
});
