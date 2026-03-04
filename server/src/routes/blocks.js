import express from 'express';
import { Resend } from 'resend';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bandchat.app';

// Get blocked users
router.get('/', authenticate, async (req, res) => {
  try {
    const blocks = await prisma.blockedUser.findMany({
      where: { blockerId: req.user.id },
      include: {
        blockedUser: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(blocks);
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
});

// Block a user
router.post('/', authenticate, async (req, res) => {
  try {
    const { blockedUserId } = req.body;

    if (!blockedUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (blockedUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    // Verify user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const block = await prisma.blockedUser.upsert({
      where: {
        blockerId_blockedUserId: {
          blockerId: req.user.id,
          blockedUserId
        }
      },
      create: {
        blockerId: req.user.id,
        blockedUserId
      },
      update: {} // No-op if already blocked
    });

    // Notify developer of block (Apple App Store requirement)
    const [blocker, blocked] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { displayName: true, email: true } }),
      prisma.user.findUnique({ where: { id: blockedUserId }, select: { displayName: true, email: true } })
    ]);

    if (resend) {
      await resend.emails.send({
        from: `BandChat <noreply@${process.env.RESEND_DOMAIN || 'resend.dev'}>`,
        to: ADMIN_EMAIL,
        subject: '[BandChat] User Block Notification',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #f59e0b;">User Blocked</h2>
            <p>A user has blocked another user in BandChat.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Blocked by</td><td style="padding: 8px 0; font-weight: 600;">${blocker?.displayName || 'Unknown'} (${blocker?.email || 'N/A'})</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Blocked user</td><td style="padding: 8px 0; font-weight: 600;">${blocked?.displayName || 'Unknown'} (${blocked?.email || 'N/A'})</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Date</td><td style="padding: 8px 0;">${new Date().toLocaleString()}</td></tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">This notification is sent per App Store content moderation requirements. Consider reviewing if multiple users block the same person.</p>
          </div>
        `
      }).catch(err => console.error('Failed to send block notification email:', err));
    }

    res.status(201).json({ message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock a user
router.delete('/:blockedUserId', authenticate, async (req, res) => {
  try {
    const { blockedUserId } = req.params;

    await prisma.blockedUser.deleteMany({
      where: {
        blockerId: req.user.id,
        blockedUserId
      }
    });

    res.json({ message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

export default router;
