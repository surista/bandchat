import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';

const router = express.Router();

// Middleware to check kitty feature access
const requireKittyFeature = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) return next(); // Non-workspace routes (transaction update/delete) check inline
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (!limits.features.kitty) {
      return res.status(403).json({ error: 'Band Kitty is a Pro feature. Upgrade to unlock.', upgrade: true });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Get band kitty with transactions
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, requireKittyFeature, async (req, res) => {
  try {
    let kitty = await prisma.bandKitty.findUnique({
      where: { workspaceId: req.params.workspaceId },
      include: {
        transactions: {
          include: {
            gig: { select: { id: true, title: true, date: true } },
            createdBy: { select: { id: true, displayName: true } }
          },
          orderBy: { date: 'desc' }
        }
      }
    });

    // Auto-create kitty if it doesn't exist
    if (!kitty) {
      kitty = await prisma.bandKitty.create({
        data: { workspaceId: req.params.workspaceId },
        include: { transactions: true }
      });
    }

    // Calculate current balance (convert Decimal to Number for arithmetic)
    const startingBal = Number(kitty.startingBalance) || 0;
    const balance = Math.round((startingBal + kitty.transactions.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'GIG_PAY' || t.type === 'OTHER_INCOME' || t.type === 'FEE') {
        return sum + amt;
      }
      return sum - Math.abs(amt); // EXPENSE subtracts
    }, 0)) * 100) / 100;

    res.json({ ...kitty, currentBalance: balance });
  } catch (error) {
    console.error('Get kitty error:', error);
    res.status(500).json({ error: 'Failed to get band kitty' });
  }
});

// Update kitty settings
router.put('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, requireKittyFeature, async (req, res) => {
  try {
    const { startingBalance, balanceAsOfDate, currency } = req.body;

    const kitty = await prisma.bandKitty.upsert({
      where: { workspaceId: req.params.workspaceId },
      update: {
        ...(startingBalance !== undefined && { startingBalance }),
        ...(balanceAsOfDate && { balanceAsOfDate: new Date(balanceAsOfDate) }),
        ...(currency && { currency })
      },
      create: {
        workspaceId: req.params.workspaceId,
        startingBalance: startingBalance || 0,
        balanceAsOfDate: balanceAsOfDate ? new Date(balanceAsOfDate) : new Date(),
        currency: currency || 'USD'
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('kitty:updated', kitty);

    res.json(kitty);
  } catch (error) {
    console.error('Update kitty error:', error);
    res.status(500).json({ error: 'Failed to update band kitty' });
  }
});

// Create transaction
router.post('/workspace/:workspaceId/transactions', authenticate, isWorkspaceMember, requireKittyFeature, async (req, res) => {
  try {
    const { type, category, amount, description, date, gigId } = req.body;

    if (!type || amount === undefined) {
      return res.status(400).json({ error: 'Type and amount are required' });
    }

    if (description && description.length > 500) return res.status(400).json({ error: 'Description must be 500 characters or less' });

    // Validate type
    const validTypes = ['GIG_PAY', 'FEE', 'EXPENSE', 'OTHER_INCOME'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Get or create kitty
    let kitty = await prisma.bandKitty.findUnique({
      where: { workspaceId: req.params.workspaceId }
    });

    if (!kitty) {
      kitty = await prisma.bandKitty.create({
        data: { workspaceId: req.params.workspaceId }
      });
    }

    const transaction = await prisma.kittyTransaction.create({
      data: {
        kittyId: kitty.id,
        type,
        category: type === 'EXPENSE' ? category : null,
        amount: Math.abs(amount),
        description: description || '',
        date: date ? new Date(date) : new Date(),
        gigId: gigId || null,
        createdById: req.user.id
      },
      include: {
        gig: { select: { id: true, title: true, date: true } },
        createdBy: { select: { id: true, displayName: true } }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('kitty:transaction:created', transaction);

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Update transaction (admin only)
router.put('/transactions/:transactionId', authenticate, async (req, res) => {
  try {
    const { type, category, amount, description, date } = req.body;

    const existing = await prisma.kittyTransaction.findUnique({
      where: { id: req.params.transactionId },
      include: { kitty: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check kitty feature access
    const wsForPlan = await prisma.workspace.findUnique({ where: { id: existing.kitty.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const planLimits = getPlanLimits(wsForPlan);
    if (!planLimits.features.kitty) {
      return res.status(403).json({ error: 'Band Kitty is a Pro feature. Upgrade to unlock.', upgrade: true });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.kitty.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only admins or the creator can modify this transaction
    if (membership.role !== 'ADMIN' && existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Only admins or the creator can modify this transaction' });
    }

    const effectiveType = type || existing.type;

    const transaction = await prisma.kittyTransaction.update({
      where: { id: req.params.transactionId },
      data: {
        ...(type && { type }),
        ...(category !== undefined && { category: effectiveType === 'EXPENSE' ? category : null }),
        ...(amount !== undefined && { amount: Math.abs(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) })
      },
      include: {
        gig: { select: { id: true, title: true, date: true } },
        createdBy: { select: { id: true, displayName: true } }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${existing.kitty.workspaceId}`).emit('kitty:transaction:updated', transaction);

    res.json(transaction);
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Delete transaction
router.delete('/transactions/:transactionId', authenticate, async (req, res) => {
  try {
    const existing = await prisma.kittyTransaction.findUnique({
      where: { id: req.params.transactionId },
      include: { kitty: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check kitty feature access
    const wsForPlan = await prisma.workspace.findUnique({ where: { id: existing.kitty.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const planLimits = getPlanLimits(wsForPlan);
    if (!planLimits.features.kitty) {
      return res.status(403).json({ error: 'Band Kitty is a Pro feature. Upgrade to unlock.', upgrade: true });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.kitty.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only admins or the creator can delete this transaction
    if (membership.role !== 'ADMIN' && existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Only admins or the creator can delete this transaction' });
    }

    await prisma.kittyTransaction.delete({
      where: { id: req.params.transactionId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${existing.kitty.workspaceId}`).emit('kitty:transaction:deleted', {
      transactionId: req.params.transactionId
    });

    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
