import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, addMemberToWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Subscriptions API', () => {
  let admin, member, outsider;
  let workspace, workspaceId;
  const WEBHOOK_SECRET = 'test-webhook-secret';

  beforeAll(async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = WEBHOOK_SECRET;

    admin = await createTestUser({ displayName: 'Sub Admin' });
    member = await createTestUser({ displayName: 'Sub Member' });
    outsider = await createTestUser({ displayName: 'Sub Outsider' });

    workspace = await createTestWorkspace(admin.token);
    workspaceId = workspace.id;
    await addMemberToWorkspace(workspaceId, member.token, admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(member.user.id);
    await cleanupUser(outsider.user.id);
    await prisma.$disconnect();
  });

  // Helper to build a webhook payload
  function buildWebhookPayload(eventType, overrides = {}) {
    return {
      event: {
        type: eventType,
        app_user_id: overrides.appUserId || admin.user.id,
        product_id: overrides.productId || 'bandchat_pro_monthly',
        store: overrides.store || 'APP_STORE',
        expiration_at_ms: overrides.expirationAtMs || (Date.now() + 30 * 24 * 60 * 60 * 1000),
        subscriber_attributes: {
          workspaceId: { $value: overrides.workspaceId || workspaceId },
          ...(overrides.subscriberAttributes || {}),
        },
        ...(overrides.eventExtra || {}),
      },
    };
  }

  // Helper: small delay to let async webhook processing finish
  function waitForWebhook() {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Helper: reset workspace plan between webhook tests
  async function resetPlan(plan = 'PRO') {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { plan, planSource: 'MANUAL', planProductId: null },
    });
  }

  // -------------------------------------------------------------------------
  // GET /:workspaceId/plan
  // -------------------------------------------------------------------------
  describe('GET /api/subscriptions/:workspaceId/plan', () => {
    it('should return plan status for member', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/${workspaceId}/plan`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('plan');
      expect(res.body).toHaveProperty('effectivePlan');
      expect(res.body).toHaveProperty('limits');
      expect(res.body).toHaveProperty('usage');
      expect(res.body.usage).toHaveProperty('members');
      expect(res.body.usage).toHaveProperty('songs');
      expect(res.body.usage).toHaveProperty('setlists');
    });

    it('should reject non-member', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/${workspaceId}/plan`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated', async () => {
      const res = await request(app)
        .get(`/api/subscriptions/${workspaceId}/plan`);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/revenuecat — Authentication
  // -------------------------------------------------------------------------
  describe('POST /api/subscriptions/webhooks/revenuecat', () => {
    describe('Authentication', () => {
      it('should reject missing Authorization header', async () => {
        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .send(buildWebhookPayload('INITIAL_PURCHASE'));

        expect(res.status).toBe(401);
      });

      it('should reject invalid secret', async () => {
        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', 'Bearer wrong-secret')
          .send(buildWebhookPayload('INITIAL_PURCHASE'));

        expect(res.status).toBe(401);
      });

      it('should accept valid secret', async () => {
        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('INITIAL_PURCHASE'));

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // Event Processing
    // -----------------------------------------------------------------------
    describe('Event Processing', () => {
      it('INITIAL_PURCHASE should activate PRO', async () => {
        await resetPlan('FREE');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('INITIAL_PURCHASE'));

        expect(res.status).toBe(200);
        await waitForWebhook();

        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('PRO');
      });

      it('RENEWAL should maintain PRO', async () => {
        await resetPlan('PRO');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('RENEWAL'));

        expect(res.status).toBe(200);
        await waitForWebhook();

        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('PRO');
      });

      it('EXPIRATION should revert to FREE', async () => {
        await resetPlan('PRO');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('EXPIRATION'));

        expect(res.status).toBe(200);
        await waitForWebhook();

        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('FREE');
      });

      it('REFUND should revert to FREE', async () => {
        await resetPlan('PRO');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('REFUND'));

        expect(res.status).toBe(200);
        await waitForWebhook();

        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('FREE');
      });

      it('CANCELLATION should be log-only (plan unchanged)', async () => {
        await resetPlan('PRO');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('CANCELLATION'));

        expect(res.status).toBe(200);
        await waitForWebhook();

        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('PRO');
      });

      it('missing workspaceId attribute should be skipped', async () => {
        await resetPlan('PRO');

        const payload = {
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: admin.user.id,
            product_id: 'bandchat_pro_monthly',
            store: 'APP_STORE',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
            subscriber_attributes: {},
          },
        };

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(payload);

        expect(res.status).toBe(200);
        await waitForWebhook();

        // Plan should remain unchanged
        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('PRO');
      });

      it('non-existent workspaceId should be skipped', async () => {
        await resetPlan('PRO');

        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('INITIAL_PURCHASE', {
            workspaceId: '00000000-0000-0000-0000-000000000000',
          }));

        expect(res.status).toBe(200);
        await waitForWebhook();

        // Original workspace plan should remain unchanged
        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        expect(ws.plan).toBe('PRO');
      });

      it('missing event body should be handled gracefully', async () => {
        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send({});

        // Webhook responds 200 immediately, then logs missing event
        expect(res.status).toBe(200);
      });

      it('unknown event type should return 200 (ignored)', async () => {
        const res = await request(app)
          .post('/api/subscriptions/webhooks/revenuecat')
          .set('Authorization', `Bearer ${WEBHOOK_SECRET}`)
          .send(buildWebhookPayload('SOME_FUTURE_EVENT_TYPE'));

        expect(res.status).toBe(200);
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /:workspaceId/activate
  // -------------------------------------------------------------------------
  describe('POST /api/subscriptions/:workspaceId/activate', () => {
    it('should reject non-admin', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/${workspaceId}/activate`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/subscriptions/${workspaceId}/activate`)
        .send({});

      expect(res.status).toBe(401);
    });
  });
});
