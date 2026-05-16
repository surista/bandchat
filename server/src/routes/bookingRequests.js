import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, isWorkspaceAdmin } from '../middleware/auth.js';
import { publicFormLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// Public endpoints (no auth) — keyed by workspace slug, not UUID, so the
// public-facing URL stays readable (`/book/the-band-name`).
// publicFormLimiter caps at 20 submissions per hour per IP.
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/bookings/public/:slug
 *
 * Returns minimal band info so the form can display the band name and a
 * "you're booking <bandName>" header. Returns 404 if the slug doesn't match
 * any workspace — doesn't reveal whether the workspace exists internally
 * vs. has just decided not to accept bookings, to avoid leaking workspace
 * existence by slug enumeration.
 */
router.get('/public/:slug', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!workspace) return res.status(404).json({ error: 'Booking page not found' });
    res.json({ bandName: workspace.name, avatarUrl: workspace.avatarUrl });
  } catch (error) {
    console.error('Get public booking page error:', error);
    res.status(500).json({ error: 'Failed to load booking page' });
  }
});

/**
 * POST /api/bookings/public/:slug
 *
 * Public form submission. Validates input lengths + email format. Creates
 * a BookingRequest tied to the workspace identified by the slug.
 *
 * Fee is stored as a free-form string ("$500", "negotiable", "TBD") since
 * most real booking inquiries don't come with a concrete number.
 */
router.post('/public/:slug', publicFormLimiter, async (req, res) => {
  try {
    const { requesterName, requesterEmail, requesterPhone, venueName, eventDate, feeOffer, message } = req.body;

    // Required fields
    if (!requesterName || typeof requesterName !== 'string' || requesterName.trim().length < 2) {
      return res.status(400).json({ error: 'Your name is required.' });
    }
    if (!requesterEmail || typeof requesterEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 5) {
      return res.status(400).json({ error: 'Please tell us a bit about the event.' });
    }

    // Length caps to prevent abuse
    if (requesterName.length > 120 || requesterEmail.length > 200 || (requesterPhone || '').length > 40 ||
        (venueName || '').length > 200 || (feeOffer || '').length > 60 || message.length > 4000) {
      return res.status(400).json({ error: 'One or more fields is too long.' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    });
    if (!workspace) return res.status(404).json({ error: 'Booking page not found' });

    let parsedEventDate = null;
    if (eventDate) {
      const d = new Date(eventDate);
      if (!isNaN(d.getTime())) parsedEventDate = d;
    }

    const created = await prisma.bookingRequest.create({
      data: {
        workspaceId: workspace.id,
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail.trim().toLowerCase(),
        requesterPhone: (requesterPhone || '').trim() || null,
        venueName: (venueName || '').trim() || null,
        eventDate: parsedEventDate,
        feeOffer: (feeOffer || '').trim() || null,
        message: message.trim(),
      },
      select: { id: true, createdAt: true, status: true, requesterName: true, venueName: true, eventDate: true },
    });

    // Notify workspace admins so their inbox count updates live. Emit per-user
    // so non-admin members in the workspace room aren't burdened with events
    // they can't act on. Fire-and-forget: a socket failure must not fail the
    // public form submission.
    try {
      const io = req.app.get('io');
      if (io) {
        const admins = await prisma.workspaceMember.findMany({
          where: { workspaceId: workspace.id, role: 'ADMIN' },
          select: { userId: true },
        });
        const payload = {
          workspaceId: workspace.id,
          request: {
            id: created.id,
            createdAt: created.createdAt,
            status: created.status,
            requesterName: created.requesterName,
            venueName: created.venueName,
            eventDate: created.eventDate,
          },
        };
        for (const a of admins) {
          io.to(`user:${a.userId}`).emit('bookingRequest:new', payload);
        }
      }
    } catch (e) {
      console.warn('Failed to emit bookingRequest:new socket event:', e.message);
    }

    res.status(201).json({ ok: true, id: created.id });
  } catch (error) {
    console.error('Create booking request error:', error);
    res.status(500).json({ error: 'Failed to submit booking request' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Authenticated endpoints — list + update + delete. Admin-only.
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/bookings/workspace/:workspaceId?status=new&limit=50
 * List booking requests for a workspace. Admin only.
 */
router.get('/workspace/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const take = Math.min(parseInt(limit, 10) || 50, 200);

    const where = { workspaceId: req.params.workspaceId };
    if (status && ['new', 'responded', 'archived'].includes(status)) {
      where.status = status;
    }

    const items = await prisma.bookingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        respondedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    res.json({ items });
  } catch (error) {
    console.error('List booking requests error:', error);
    res.status(500).json({ error: 'Failed to load booking requests' });
  }
});

/**
 * PUT /api/bookings/:id
 * Update status. Admin only — must be admin of the request's workspace.
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'responded', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await prisma.bookingRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, workspaceId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Booking request not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existing.workspaceId } },
    });
    if (!member || member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        respondedAt: status === 'responded' ? new Date() : null,
        respondedById: status === 'responded' ? req.user.id : null,
      },
      include: {
        respondedBy: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update booking request error:', error);
    res.status(500).json({ error: 'Failed to update booking request' });
  }
});

/**
 * DELETE /api/bookings/:id
 * Hard delete. Admin only.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.bookingRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, workspaceId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Booking request not found' });

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existing.workspaceId } },
    });
    if (!member || member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    await prisma.bookingRequest.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete booking request error:', error);
    res.status(500).json({ error: 'Failed to delete booking request' });
  }
});

export default router;
