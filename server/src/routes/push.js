import express from 'express';
import webpush from 'web-push';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || 'admin@bandchat.app'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Get VAPID public key
router.get('/vapid-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    // Upsert subscription (update if exists, create if not)
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth
      },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth
      }
    });

    res.json({ message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: req.user.id,
        endpoint
      }
    });

    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get notification snooze status
router.get('/snooze-status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notificationsSnoozedUntil: true }
    });
    res.json({ snoozedUntil: user?.notificationsSnoozedUntil || null });
  } catch (error) {
    console.error('Get snooze status error:', error);
    res.status(500).json({ error: 'Failed to get snooze status' });
  }
});

// Set notification snooze
router.post('/snooze', authenticate, async (req, res) => {
  try {
    const { duration } = req.body; // 'off' | 30 | 60 | 120 | 'indefinitely'

    let snoozedUntil = null;
    if (duration === 30) {
      snoozedUntil = new Date(Date.now() + 30 * 60 * 1000);
    } else if (duration === 60) {
      snoozedUntil = new Date(Date.now() + 60 * 60 * 1000);
    } else if (duration === 120) {
      snoozedUntil = new Date(Date.now() + 120 * 60 * 1000);
    } else if (duration === 'indefinitely') {
      snoozedUntil = new Date('2099-12-31');
    }
    // 'off' or invalid value leaves snoozedUntil as null (notifications active)

    await prisma.user.update({
      where: { id: req.user.id },
      data: { notificationsSnoozedUntil: snoozedUntil }
    });

    res.json({ snoozedUntil });
  } catch (error) {
    console.error('Set snooze error:', error);
    res.status(500).json({ error: 'Failed to set snooze' });
  }
});

// Helper function to send push notification to a user
export const sendPushToUser = async (userId, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  try {
    // Check if user has snoozed notifications
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationsSnoozedUntil: true }
    });

    if (user?.notificationsSnoozedUntil && new Date(user.notificationsSnoozedUntil) > new Date()) {
      return; // Notifications are snoozed, skip sending
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    const notifications = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          JSON.stringify(payload)
        );
      } catch (error) {
        // Remove invalid subscriptions
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { id: sub.id }
          }).catch(err => console.warn('Failed to remove invalid push subscription:', err.message));
        }
      }
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error('Send push error:', error);
  }
};

export default router;
