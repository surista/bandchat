import express from 'express';
import crypto from 'crypto';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits, serializePlanLimits } from '../lib/planLimits.js';
import { getSubscriber, isEntitlementActive, getEntitlementStore } from '../lib/revenuecat.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a RevenueCat store string to the BandChat planSource enum value.
 */
function mapStoreToPlanSource(store) {
  if (store === 'app_store') return 'APPLE';
  if (store === 'play_store') return 'GOOGLE';
  return 'REVENUECAT';
}

/**
 * Emit a plan:updated Socket.IO event to every member of the workspace.
 */
function emitPlanUpdated(req, workspaceId, workspace) {
  const io = req.app.get('io');
  if (!io) return;

  const effectivePlan = getEffectivePlan(workspace);
  const planLimits = serializePlanLimits(getPlanLimits(workspace));

  io.to(`workspace:${workspaceId}`).emit('plan:updated', {
    plan: workspace.plan,
    effectivePlan,
    planExpiresAt: workspace.planExpiresAt,
    planLimits,
  });
}

// ---------------------------------------------------------------------------
// GET /:workspaceId/plan — Get plan status, limits, and usage
// ---------------------------------------------------------------------------
router.get('/:workspaceId/plan', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        planSource: true,
        planExpiresAt: true,
        planProductId: true,
        planUpdatedAt: true,
        storageUsedBytes: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const effectivePlan = getEffectivePlan(workspace);
    const limits = getPlanLimits(workspace);

    // Gather current usage counts
    const [memberCount, songCount, setlistCount] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.song.count({ where: { workspaceId } }),
      prisma.setlist.count({ where: { workspaceId } }),
    ]);

    res.json({
      plan: workspace.plan,
      effectivePlan,
      planSource: workspace.planSource,
      planExpiresAt: workspace.planExpiresAt,
      planProductId: workspace.planProductId,
      planUpdatedAt: workspace.planUpdatedAt,
      limits: serializePlanLimits(limits),
      usage: {
        members: memberCount,
        songs: songCount,
        setlists: setlistCount,
        storageBytes: workspace.storageUsedBytes,
      },
    });
  } catch (error) {
    console.error('Get plan status error:', error);
    res.status(500).json({ error: 'Failed to get plan status' });
  }
});

// ---------------------------------------------------------------------------
// POST /:workspaceId/activate — Verify active RevenueCat entitlement and activate Pro
// ---------------------------------------------------------------------------
router.post('/:workspaceId/activate', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Fetch subscriber from RevenueCat using the authenticated user's ID
    let subscriber;
    try {
      subscriber = await getSubscriber(req.user.id);
    } catch (err) {
      console.error('[Subscriptions] RevenueCat fetch error:', err.message);
      return res.status(502).json({ error: `RevenueCat error: ${err.message}` });
    }

    // Check the 'BandChat Pro' entitlement is active
    if (!isEntitlementActive(subscriber, 'BandChat Pro')) {
      return res.status(402).json({ error: 'No active Pro subscription found.' });
    }

    // Verify the subscriber's workspaceId attribute matches this workspace
    const subscriberWorkspaceId = subscriber.subscriber_attributes?.workspaceId?.$value;
    if (subscriberWorkspaceId && subscriberWorkspaceId !== workspaceId) {
      return res.status(403).json({
        error: 'This subscription is linked to a different workspace.',
      });
    }

    // Extract entitlement details
    const entitlement = subscriber.entitlements['BandChat Pro'];
    const store = getEntitlementStore(subscriber, 'BandChat Pro');
    const planSource = mapStoreToPlanSource(store);
    const planExpiresAt = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
    const planProductId = entitlement.product_identifier ?? null;

    // Persist the activated plan
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: 'PRO',
        planSource,
        planExpiresAt,
        planProductId,
        planUpdatedAt: new Date(),
      },
    });

    // Notify all workspace members in real time
    emitPlanUpdated(req, workspaceId, updatedWorkspace);

    const effectivePlan = getEffectivePlan(updatedWorkspace);
    const planLimits = serializePlanLimits(getPlanLimits(updatedWorkspace));

    res.json({
      plan: updatedWorkspace.plan,
      effectivePlan,
      planSource: updatedWorkspace.planSource,
      planExpiresAt: updatedWorkspace.planExpiresAt,
      planProductId: updatedWorkspace.planProductId,
      planUpdatedAt: updatedWorkspace.planUpdatedAt,
      limits: planLimits,
    });
  } catch (error) {
    console.error('Activate plan error:', error);
    res.status(500).json({ error: 'Failed to activate plan' });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/revenuecat — RevenueCat webhook handler
//
// No authenticate middleware — this is called by RevenueCat's servers.
// Verified via a shared secret in the Authorization header.
// ---------------------------------------------------------------------------
router.post('/webhooks/revenuecat', async (req, res) => {
  // Verify the shared webhook secret
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Subscriptions] REVENUECAT_WEBHOOK_SECRET not set — rejecting webhook');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  const expectedAuth = `Bearer ${secret}`;
  const actualAuth = req.headers.authorization || '';
  const expectedBuf = Buffer.from(expectedAuth, 'utf-8');
  const actualBuf = Buffer.from(actualAuth, 'utf-8');
  const isValid = expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);
  if (!isValid) {
    console.warn('[Subscriptions] RevenueCat webhook: invalid authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Acknowledge immediately — RevenueCat expects a fast 200
  res.status(200).json({ ok: true });

  // Process the event asynchronously after responding
  try {
    const event = req.body?.event;
    if (!event) {
      console.warn('[Subscriptions] RevenueCat webhook: missing event body');
      return;
    }

    const { type: eventType, app_user_id: appUserId } = event;
    const workspaceId = event.subscriber_attributes?.workspaceId?.$value;

    console.log(`[Subscriptions] RevenueCat webhook event: ${eventType}, user: ${appUserId}, workspace: ${workspaceId ?? 'none'}`);

    if (!workspaceId) {
      console.log('[Subscriptions] RevenueCat webhook: no workspaceId attribute — skipping');
      return;
    }

    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) {
      console.log(`[Subscriptions] RevenueCat webhook: workspace ${workspaceId} not found — skipping`);
      return;
    }

    // Activation events — set plan to PRO
    const activationEvents = [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
    ];

    // Deactivation events — revert plan to FREE
    const deactivationEvents = ['EXPIRATION', 'REFUND'];

    // Log-only events — subscription still valid until natural expiry
    const logOnlyEvents = ['CANCELLATION', 'BILLING_ISSUE'];

    if (activationEvents.includes(eventType)) {
      const store = event.store ?? null;
      const planSource = mapStoreToPlanSource(store);
      const planExpiresAt = event.expiration_at_ms
        ? new Date(event.expiration_at_ms)
        : null;
      const planProductId = event.product_id ?? null;

      const updatedWorkspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan: 'PRO',
          planSource,
          planExpiresAt,
          planProductId,
          planUpdatedAt: new Date(),
        },
      });

      const io = req.app.get('io');
      if (io) {
        emitPlanUpdated(req, workspaceId, updatedWorkspace);
      }

      console.log(`[Subscriptions] RevenueCat webhook: PRO activated for workspace ${workspaceId} (${eventType})`);

    } else if (deactivationEvents.includes(eventType)) {
      const updatedWorkspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan: 'FREE',
          planProductId: null,
          planUpdatedAt: new Date(),
        },
      });

      const io = req.app.get('io');
      if (io) {
        emitPlanUpdated(req, workspaceId, updatedWorkspace);
      }

      console.log(`[Subscriptions] RevenueCat webhook: plan reverted to FREE for workspace ${workspaceId} (${eventType})`);

    } else if (logOnlyEvents.includes(eventType)) {
      console.log(`[Subscriptions] RevenueCat webhook: ${eventType} logged — subscription remains active until expiry (workspace: ${workspaceId})`);

    } else {
      console.log(`[Subscriptions] RevenueCat webhook: unhandled event type "${eventType}" — ignoring`);
    }
  } catch (error) {
    console.error('[Subscriptions] RevenueCat webhook processing error:', error);
  }
});

export default router;
