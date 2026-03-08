import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits, serializePlanLimits } from '../lib/planLimits.js';

const router = express.Router();

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
// POST /:workspaceId/verify-purchase — Validate IAP receipt and activate Pro
// ---------------------------------------------------------------------------
router.post('/:workspaceId/verify-purchase', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { platform, receipt, productId } = req.body;

    // Input validation
    if (!platform || !['APPLE', 'GOOGLE'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be APPLE or GOOGLE.' });
    }
    if (!receipt || typeof receipt !== 'string') {
      return res.status(400).json({ error: 'Receipt is required.' });
    }
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Product ID is required.' });
    }

    // -----------------------------------------------------------------------
    // TODO: Validate receipt with Apple App Store / Google Play
    //
    // Apple:
    //   - POST to https://buy.itunes.apple.com/verifyReceipt (prod)
    //     or https://sandbox.itunes.apple.com/verifyReceipt (sandbox)
    //   - Use App Store Server API v2 for modern validation
    //   - Verify bundle_id, product_id, and transaction status
    //
    // Google:
    //   - Use googleapis (google-auth-library + androidpublisher v3)
    //   - purchases.subscriptions.get or purchases.products.get
    //   - Verify packageName, productId, and purchase state
    //
    // For now, log and proceed (STUB)
    // -----------------------------------------------------------------------
    console.log(`[Subscriptions] Verify purchase — workspace: ${workspaceId}, platform: ${platform}, productId: ${productId}`);

    // Extract a unique transaction ID from the receipt
    // TODO: Parse actual transaction ID from validated receipt response
    const originalTxId = `${platform}_${Date.now()}_${workspaceId}`;

    // Check for duplicate redemption
    const existingWorkspace = await prisma.workspace.findFirst({
      where: { planOriginalTxId: originalTxId },
    });
    if (existingWorkspace) {
      return res.status(409).json({ error: 'This purchase has already been redeemed.' });
    }

    // Determine plan duration from productId
    let planExpiresAt;
    if (productId === 'bandchat_pro_monthly') {
      planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (productId === 'bandchat_pro_annual') {
      planExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else if (productId === 'bandchat_pro_lifetime') {
      planExpiresAt = null; // lifetime — never expires
    } else {
      return res.status(400).json({ error: `Unknown product ID: ${productId}` });
    }

    // Activate Pro plan
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: 'PRO',
        planSource: platform,
        planProductId: productId,
        planExpiresAt,
        planOriginalTxId: originalTxId,
        planUpdatedAt: new Date(),
      },
    });

    const effectivePlan = getEffectivePlan(updatedWorkspace);
    const planLimits = serializePlanLimits(getPlanLimits(updatedWorkspace));

    // Notify all workspace members in real time
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${workspaceId}`).emit('plan:updated', {
        plan: updatedWorkspace.plan,
        effectivePlan,
        planExpiresAt: updatedWorkspace.planExpiresAt,
        planLimits,
      });
    }

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
    console.error('Verify purchase error:', error);
    res.status(500).json({ error: 'Failed to verify purchase' });
  }
});

// ---------------------------------------------------------------------------
// POST /:workspaceId/restore — Restore previous purchases
// ---------------------------------------------------------------------------
router.post('/:workspaceId/restore', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { platform, receipts } = req.body;

    if (!platform || !['APPLE', 'GOOGLE'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be APPLE or GOOGLE.' });
    }
    if (!Array.isArray(receipts) || receipts.length === 0) {
      return res.status(400).json({ error: 'Receipts array is required.' });
    }

    // -----------------------------------------------------------------------
    // TODO: Validate each receipt with Apple/Google and find the active one
    //
    // For each receipt:
    //   1. Validate with the platform API
    //   2. Check if the subscription is still active/valid
    //   3. Match the original transaction ID to this workspace
    //   4. If found, re-activate or extend the plan
    //
    // For now, return a stub response
    // -----------------------------------------------------------------------
    console.log(`[Subscriptions] Restore — workspace: ${workspaceId}, platform: ${platform}, receipts: ${receipts.length}`);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true, planExpiresAt: true, planSource: true, planProductId: true, planUpdatedAt: true },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const effectivePlan = getEffectivePlan(workspace);

    res.json({
      restored: false, // TODO: set to true when a valid subscription is found
      plan: workspace.plan,
      effectivePlan,
      planSource: workspace.planSource,
      planExpiresAt: workspace.planExpiresAt,
      planProductId: workspace.planProductId,
      planUpdatedAt: workspace.planUpdatedAt,
      limits: serializePlanLimits(getPlanLimits(workspace)),
    });
  } catch (error) {
    console.error('Restore purchases error:', error);
    res.status(500).json({ error: 'Failed to restore purchases' });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/apple — Apple App Store Server Notifications v2
// ---------------------------------------------------------------------------
router.post('/webhooks/apple', async (req, res) => {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload) {
      return res.status(400).json({ error: 'Missing signedPayload' });
    }

    // -----------------------------------------------------------------------
    // TODO: Verify JWS (JSON Web Signature) using Apple's public key
    //
    // 1. Decode the signedPayload (JWS compact serialization)
    // 2. Verify signature with Apple's root certificate chain
    // 3. Extract notificationType and subtype from the decoded payload
    // 4. Handle notification types:
    //    - DID_RENEW          → extend planExpiresAt
    //    - EXPIRED            → plan reverts to FREE (or let getEffectivePlan handle it)
    //    - DID_FAIL_TO_RENEW  → log warning, optionally notify admin
    //    - REFUND             → revert plan to FREE
    //    - REVOKE             → revert plan to FREE
    //    - CONSUMPTION_REQUEST → respond with usage data
    //    - SUBSCRIBED         → activate PRO (if not already)
    //    - DID_CHANGE_RENEWAL_INFO → update planProductId if changed
    //
    // 5. Look up workspace by planOriginalTxId
    // 6. Update workspace plan fields as needed
    // 7. Emit plan:updated via Socket.IO
    // -----------------------------------------------------------------------
    console.log('[Subscriptions] Apple webhook received:', typeof signedPayload === 'string' ? signedPayload.substring(0, 50) + '...' : 'invalid');

    // Always return 200 to Apple to acknowledge receipt
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Apple webhook error:', error);
    // Still return 200 to prevent Apple from retrying
    res.status(200).json({ ok: true });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/google — Google Play Real-Time Developer Notifications
// ---------------------------------------------------------------------------
router.post('/webhooks/google', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.data) {
      return res.status(400).json({ error: 'Missing message data' });
    }

    // -----------------------------------------------------------------------
    // TODO: Process Google Play RTDN (Real-Time Developer Notification)
    //
    // 1. Decode message.data (base64-encoded JSON)
    // 2. Verify the Pub/Sub push authentication token
    // 3. Parse the DeveloperNotification:
    //    - subscriptionNotification → handle state changes
    //    - oneTimeProductNotification → handle one-time purchases
    //    - testNotification → log and ignore
    // 4. For subscriptionNotification, check notificationType:
    //    - SUBSCRIPTION_RECOVERED (1)    → reactivate PRO
    //    - SUBSCRIPTION_RENEWED (2)      → extend planExpiresAt
    //    - SUBSCRIPTION_CANCELED (3)     → log, will expire naturally
    //    - SUBSCRIPTION_PURCHASED (4)    → activate PRO
    //    - SUBSCRIPTION_EXPIRED (13)     → revert to FREE
    //    - SUBSCRIPTION_REVOKED (12)     → revert to FREE
    //    - SUBSCRIPTION_RESTARTED (7)    → reactivate PRO
    // 5. Look up workspace by planOriginalTxId
    // 6. Update workspace plan fields as needed
    // 7. Emit plan:updated via Socket.IO
    // -----------------------------------------------------------------------
    console.log('[Subscriptions] Google webhook received');

    // Always return 200 to acknowledge receipt
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Google webhook error:', error);
    // Still return 200 to prevent Google from retrying
    res.status(200).json({ ok: true });
  }
});

export default router;
