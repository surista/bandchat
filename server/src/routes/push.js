import express from 'express';
import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const expo = new Expo();

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
router.post('/subscribe', authenticate, apiLimiter, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    if (endpoint.length > 2000 || keys.p256dh.length > 500 || keys.auth.length > 500) {
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

// Register Expo push token (mobile)
router.post('/expo-token', authenticate, async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token || !Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Invalid Expo push token' });
    }
    if (!platform || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    await prisma.expoPushToken.upsert({
      where: { token },
      update: { userId: req.user.id, platform },
      create: { userId: req.user.id, token, platform }
    });

    res.json({ message: 'Expo push token registered' });
  } catch (error) {
    console.error('Expo token register error:', error);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// Unregister Expo push token (on logout)
router.delete('/expo-token', authenticate, async (req, res) => {
  try {
    const { token } = req.body;

    if (token) {
      await prisma.expoPushToken.deleteMany({
        where: { userId: req.user.id, token }
      });
    } else {
      // Delete all tokens for this user (full logout)
      await prisma.expoPushToken.deleteMany({
        where: { userId: req.user.id }
      });
    }

    res.json({ message: 'Expo push token removed' });
  } catch (error) {
    console.error('Expo token unregister error:', error);
    res.status(500).json({ error: 'Failed to unregister token' });
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

// Get notification preferences for a workspace
router.get('/preferences/:workspaceId', authenticate, async (req, res) => {
  try {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId
        }
      },
      select: {
        notifyDMs: true,
        notifyMentions: true,
        notifyGigChanges: true,
        notifyAnnouncements: true,
        notifyChannelMessages: true
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(member);
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

// Update notification preferences for a workspace
router.put('/preferences/:workspaceId', authenticate, async (req, res) => {
  try {
    const { notifyDMs, notifyMentions, notifyGigChanges, notifyAnnouncements, notifyChannelMessages } = req.body;

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const data = {};
    if (typeof notifyDMs === 'boolean') data.notifyDMs = notifyDMs;
    if (typeof notifyMentions === 'boolean') data.notifyMentions = notifyMentions;
    if (typeof notifyGigChanges === 'boolean') data.notifyGigChanges = notifyGigChanges;
    if (typeof notifyAnnouncements === 'boolean') data.notifyAnnouncements = notifyAnnouncements;
    if (typeof notifyChannelMessages === 'boolean') data.notifyChannelMessages = notifyChannelMessages;

    const updated = await prisma.workspaceMember.update({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId
        }
      },
      data,
      select: {
        notifyDMs: true,
        notifyMentions: true,
        notifyGigChanges: true,
        notifyAnnouncements: true,
        notifyChannelMessages: true
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// Validate that a push notification URL is safe (relative path or app domain only)
function sanitizePushUrl(url) {
  if (!url) return undefined;
  // Allow relative paths (e.g., /workspace/...)
  if (url.startsWith('/')) return url;
  // Allow app domain URLs
  const allowedOrigins = [
    process.env.CLIENT_URL,
    process.env.VITE_API_URL
  ].filter(Boolean);
  try {
    const parsed = new URL(url);
    if (allowedOrigins.some(origin => parsed.origin === new URL(origin).origin)) {
      return url;
    }
  } catch {
    // Not a valid URL — reject
  }
  // Discard arbitrary external URLs to prevent open redirect via push notifications
  return undefined;
}

// Helper function to send push notification to a user
// options: { category: 'mention'|'dm'|'gig'|'announcement'|'channel', workspaceId: string }
export const sendPushToUser = async (userId, payload, options = {}) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  // Sanitize URL in payload to prevent open redirect
  if (payload.url) {
    payload.url = sanitizePushUrl(payload.url);
  }

  try {
    // Check if user has snoozed notifications
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationsSnoozedUntil: true }
    });

    if (user?.notificationsSnoozedUntil && new Date(user.notificationsSnoozedUntil) > new Date()) {
      return; // Notifications are snoozed, skip sending
    }

    // Check per-workspace notification preferences
    if (options.category && options.workspaceId) {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: options.workspaceId
          }
        }
      });

      if (member) {
        const categoryMap = {
          mention: 'notifyMentions',
          dm: 'notifyDMs',
          gig: 'notifyGigChanges',
          announcement: 'notifyAnnouncements',
          channel: 'notifyChannelMessages'
        };

        const prefKey = categoryMap[options.category];
        if (prefKey && member[prefKey] === false) {
          return; // User has disabled this notification category
        }
      }
    }

    // Send web push notifications
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    const webNotifications = subscriptions.map(async (sub) => {
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

    // Send Expo push notifications (mobile)
    const expoTokens = await prisma.expoPushToken.findMany({
      where: { userId }
    });

    // Calculate total unread count for badge (single efficient query)
    let badgeCount = 1;
    try {
      const result = await prisma.$queryRaw`
        SELECT COUNT(m.id)::int AS count
        FROM "ChannelMember" cm
        JOIN "Message" m ON m."channelId" = cm."channelId"
          AND m."createdAt" > cm."lastRead"
          AND m."authorId" != cm."userId"
          AND m."parentId" IS NULL
        WHERE cm."userId" = ${userId}
          AND cm.muted = false
      `;
      const count = result[0]?.count || 0;
      if (count > 0) badgeCount = count;
    } catch (e) {
      console.error('Failed to calculate badge count:', e);
    }

    const expoMessages = expoTokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        badge: badgeCount,
        ...(payload.threadId && { threadId: payload.threadId }),
        data: {
          url: payload.url,
          channelId: payload.channelId,
          workspaceId: payload.workspaceId,
          tag: payload.tag,
        },
      }));

    const expoNotifications = (async () => {
      if (expoMessages.length === 0) return;
      const chunks = expo.chunkPushNotifications(expoMessages);
      for (const chunk of chunks) {
        try {
          const receipts = await expo.sendPushNotificationsAsync(chunk);
          // Clean up invalid tokens
          for (let i = 0; i < receipts.length; i++) {
            if (receipts[i].status === 'error' &&
                receipts[i].details?.error === 'DeviceNotRegistered') {
              const badToken = chunk[i].to;
              await prisma.expoPushToken.deleteMany({
                where: { token: badToken }
              }).catch(err => console.warn('Failed to remove invalid Expo token:', err.message));
            }
          }
        } catch (err) {
          console.error('Expo push send error:', err);
        }
      }
    })();

    await Promise.all([...webNotifications, expoNotifications]);
  } catch (error) {
    console.error('Send push error:', error);
  }
};

export default router;
