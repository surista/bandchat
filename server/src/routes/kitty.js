import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get band kitty with transactions
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
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

    // Calculate current balance
    const balance = kitty.startingBalance + kitty.transactions.reduce((sum, t) => {
      if (t.type === 'GIG_PAY' || t.type === 'OTHER_INCOME' || t.type === 'FEE') {
        return sum + t.amount;
      }
      return sum - Math.abs(t.amount); // EXPENSE subtracts
    }, 0);

    res.json({ ...kitty, currentBalance: balance });
  } catch (error) {
    console.error('Get kitty error:', error);
    res.status(500).json({ error: 'Failed to get band kitty' });
  }
});

// Update kitty settings (admin only)
router.put('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { startingBalance, balanceAsOfDate } = req.body;

    const kitty = await prisma.bandKitty.upsert({
      where: { workspaceId: req.params.workspaceId },
      update: {
        ...(startingBalance !== undefined && { startingBalance }),
        ...(balanceAsOfDate && { balanceAsOfDate: new Date(balanceAsOfDate) })
      },
      create: {
        workspaceId: req.params.workspaceId,
        startingBalance: startingBalance || 0,
        balanceAsOfDate: balanceAsOfDate ? new Date(balanceAsOfDate) : new Date()
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

// Create transaction (admin only)
router.post('/workspace/:workspaceId/transactions', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { type, category, amount, description, date, gigId } = req.body;

    if (!type || amount === undefined || !description) {
      return res.status(400).json({ error: 'Type, amount, and description are required' });
    }

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
        description,
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

    // Check admin permission
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.kitty.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const transaction = await prisma.kittyTransaction.update({
      where: { id: req.params.transactionId },
      data: {
        ...(type && { type }),
        ...(category !== undefined && { category: type === 'EXPENSE' ? category : null }),
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

// Delete transaction (admin only)
router.delete('/transactions/:transactionId', authenticate, async (req, res) => {
  try {
    const existing = await prisma.kittyTransaction.findUnique({
      where: { id: req.params.transactionId },
      include: { kitty: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check admin permission
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existing.kitty.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
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
