import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all contacts for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { category } = req.query;

    const contacts = await prisma.contact.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        ...(category && { category })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json(contacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// Create a contact
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, category, email, phone, website, address, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const VALID_CATEGORIES = ['venue', 'agent', 'sound', 'lighting', 'manager', 'photographer', 'promoter', 'other'];
    if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });

    if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (phone && phone.length > 50) return res.status(400).json({ error: 'Phone must be 50 characters or less' });
    if (email && email.length > 255) return res.status(400).json({ error: 'Email must be 255 characters or less' });
    if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes must be 2,000 characters or less' });
    if (website && website.length > 500) return res.status(400).json({ error: 'Website must be 500 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });

    const contact = await prisma.contact.create({
      data: {
        name,
        category: category || 'other',
        email,
        phone,
        website,
        address,
        notes,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('contact:created', contact);

    res.status(201).json(contact);
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Get a single contact
router.get('/:contactId', authenticate, async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.contactId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: contact.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(contact);
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// Update a contact
router.put('/:contactId', authenticate, async (req, res) => {
  try {
    const { name, category, email, phone, website, address, notes } = req.body;

    // First fetch the contact to check workspace membership
    const existingContact = await prisma.contact.findUnique({
      where: { id: req.params.contactId }
    });

    if (!existingContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Verify user is creator or admin
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existingContact.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    if (existingContact.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can update this contact' });
    }

    // Input length validation
    if (name && name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (phone && phone.length > 50) return res.status(400).json({ error: 'Phone must be 50 characters or less' });
    if (email && email.length > 255) return res.status(400).json({ error: 'Email must be 255 characters or less' });
    if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes must be 2,000 characters or less' });
    if (website && website.length > 500) return res.status(400).json({ error: 'Website must be 500 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });

    const contact = await prisma.contact.update({
      where: { id: req.params.contactId },
      data: {
        ...(name && { name }),
        ...(category !== undefined && { category }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(website !== undefined && { website }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${contact.workspaceId}`).emit('contact:updated', contact);

    res.json(contact);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete a contact
router.delete('/:contactId', authenticate, async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.contactId }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: contact.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (contact.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can delete contacts' });
    }

    await prisma.contact.delete({
      where: { id: req.params.contactId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${contact.workspaceId}`).emit('contact:deleted', { contactId: req.params.contactId });

    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
