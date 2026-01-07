import express from 'express';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

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

// Helper function to send push notification to a user
export const sendPushToUser = async (userId, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  try {
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
          }).catch(() => {});
        }
      }
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error('Send push error:', error);
  }
};

export default router;
