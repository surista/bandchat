import express from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

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

    await prisma.blockedUser.upsert({
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
