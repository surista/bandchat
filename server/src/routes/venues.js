import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';

const router = express.Router();

router.use(apiLimiter);

const VENUE_INCLUDE = {
  createdBy: {
    select: { id: true, displayName: true }
  },
  _count: {
    select: { gigs: true }
  }
};

// Get all venues for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: VENUE_INCLUDE,
      orderBy: { name: 'asc' }
    });

    res.json(venues);
  } catch (error) {
    console.error('Get venues error:', error);
    res.status(500).json({ error: 'Failed to get venues' });
  }
});

// Create a venue
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { name, address, city, imageUrl, phone, email, website, capacity, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });
    if (city && city.length > 200) return res.status(400).json({ error: 'City must be 200 characters or less' });
    if (phone && phone.length > 50) return res.status(400).json({ error: 'Phone must be 50 characters or less' });
    if (email && email.length > 255) return res.status(400).json({ error: 'Email must be 255 characters or less' });
    if (website && website.length > 500) return res.status(400).json({ error: 'Website must be 500 characters or less' });
    if (website && !/^https?:\/\//i.test(website)) return res.status(400).json({ error: 'Website must start with http:// or https://' });
    if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes must be 2,000 characters or less' });
    if (capacity !== undefined && capacity !== null && (typeof capacity !== 'number' || capacity < 1)) {
      return res.status(400).json({ error: 'Capacity must be a positive number' });
    }
    if (imageUrl && !isAllowedUploadUrl(imageUrl).valid) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    const venue = await prisma.venue.create({
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        city: city?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        website: website?.trim() || null,
        capacity: capacity != null ? Math.round(capacity) : null,
        notes: notes?.trim() || null,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: VENUE_INCLUDE
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('venue:created', venue);

    res.status(201).json(venue);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A venue with this name already exists in this workspace' });
    }
    console.error('Create venue error:', error);
    res.status(500).json({ error: 'Failed to create venue' });
  }
});

// Get a single venue
router.get('/:venueId', authenticate, async (req, res) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params.venueId },
      include: VENUE_INCLUDE
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: venue.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(venue);
  } catch (error) {
    console.error('Get venue error:', error);
    res.status(500).json({ error: 'Failed to get venue' });
  }
});

// Update a venue
router.put('/:venueId', authenticate, async (req, res) => {
  try {
    const { name, address, city, imageUrl, phone, email, website, capacity, notes } = req.body;

    const existingVenue = await prisma.venue.findUnique({
      where: { id: req.params.venueId }
    });

    if (!existingVenue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existingVenue.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    if (existingVenue.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can update this venue' });
    }

    if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: 'Name is required' });
    if (name && name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });
    if (city && city.length > 200) return res.status(400).json({ error: 'City must be 200 characters or less' });
    if (phone && phone.length > 50) return res.status(400).json({ error: 'Phone must be 50 characters or less' });
    if (email && email.length > 255) return res.status(400).json({ error: 'Email must be 255 characters or less' });
    if (website && website.length > 500) return res.status(400).json({ error: 'Website must be 500 characters or less' });
    if (website && !/^https?:\/\//i.test(website)) return res.status(400).json({ error: 'Website must start with http:// or https://' });
    if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes must be 2,000 characters or less' });
    if (capacity !== undefined && capacity !== null && (typeof capacity !== 'number' || capacity < 1)) {
      return res.status(400).json({ error: 'Capacity must be a positive number' });
    }
    if (imageUrl && !isAllowedUploadUrl(imageUrl).valid) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    const venue = await prisma.venue.update({
      where: { id: req.params.venueId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(city !== undefined && { city: city?.trim() || null }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(website !== undefined && { website: website?.trim() || null }),
        ...(capacity !== undefined && { capacity: capacity != null ? Math.round(capacity) : null }),
        ...(notes !== undefined && { notes: notes?.trim() || null })
      },
      include: VENUE_INCLUDE
    });

    // Also update the venue name string on any linked gigs for backward compat
    if (name !== undefined) {
      await prisma.gig.updateMany({
        where: { venueId: req.params.venueId },
        data: { venue: name.trim() }
      });
    }

    const io = req.app.get('io');
    io.to(`workspace:${venue.workspaceId}`).emit('venue:updated', venue);

    res.json(venue);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A venue with this name already exists in this workspace' });
    }
    console.error('Update venue error:', error);
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

// Delete a venue
router.delete('/:venueId', authenticate, async (req, res) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params.venueId }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: venue.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    if (venue.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can delete venues' });
    }

    await prisma.venue.delete({
      where: { id: req.params.venueId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${venue.workspaceId}`).emit('venue:deleted', { venueId: req.params.venueId });

    res.json({ message: 'Venue deleted' });
  } catch (error) {
    console.error('Delete venue error:', error);
    res.status(500).json({ error: 'Failed to delete venue' });
  }
});

export default router;
