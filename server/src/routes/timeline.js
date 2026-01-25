import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all timeline events for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const events = await prisma.timelineEvent.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { eventDate: 'desc' }
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Create a timeline event
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, description, eventType, eventDate, imageUrl } = req.body;

    if (!title || !eventType || !eventDate) {
      return res.status(400).json({ error: 'Title, event type, and date are required' });
    }

    const validTypes = ['formation', 'first_gig', 'gig', 'rehearsal', 'member_joined', 'member_left', 'album_release', 'milestone', 'custom'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    const event = await prisma.timelineEvent.create({
      data: {
        title,
        description,
        eventType,
        eventDate: new Date(eventDate),
        imageUrl,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('timeline:created', event);

    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating timeline event:', error);
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

// Update a timeline event
router.put('/:eventId', authenticate, async (req, res) => {
  try {
    const event = await prisma.timelineEvent.findUnique({
      where: { id: req.params.eventId }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: event.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only creator or admin can update
    if (event.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, eventType, eventDate, imageUrl } = req.body;

    const updated = await prisma.timelineEvent.update({
      where: { id: req.params.eventId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(eventType && { eventType }),
        ...(eventDate && { eventDate: new Date(eventDate) }),
        ...(imageUrl !== undefined && { imageUrl })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${event.workspaceId}`).emit('timeline:updated', updated);

    res.json(updated);
  } catch (error) {
    console.error('Error updating timeline event:', error);
    res.status(500).json({ error: 'Failed to update timeline event' });
  }
});

// Delete a timeline event
router.delete('/:eventId', authenticate, async (req, res) => {
  try {
    const event = await prisma.timelineEvent.findUnique({
      where: { id: req.params.eventId }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: event.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only creator or admin can delete
    if (event.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.timelineEvent.delete({
      where: { id: req.params.eventId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${event.workspaceId}`).emit('timeline:deleted', { id: req.params.eventId });

    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Error deleting timeline event:', error);
    res.status(500).json({ error: 'Failed to delete timeline event' });
  }
});

// Auto-generate timeline from actual band data
router.post('/workspace/:workspaceId/generate', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const now = new Date();
    const events = [];

    // Helper to check if event already exists
    async function eventExists(eventType, titlePattern = null) {
      const where = { workspaceId, eventType };
      if (titlePattern) {
        where.title = { contains: titlePattern };
      }
      return await prisma.timelineEvent.findFirst({ where });
    }

    // Get all band members with join dates
    const members = await prisma.bandMember.findMany({
      where: { workspaceId },
      orderBy: { joinDate: 'asc' }
    });

    // Find earliest member join date for "Band Formed"
    const earliestMember = members.find(m => m.joinDate);
    if (earliestMember && !await eventExists('formation')) {
      events.push({
        title: 'Band Formed',
        description: 'The beginning of our journey',
        eventType: 'formation',
        eventDate: earliestMember.joinDate,
        workspaceId,
        createdById: req.user.id
      });
    }

    // Add member joined events
    for (const member of members) {
      if (member.joinDate && !await eventExists('member_joined', member.name)) {
        events.push({
          title: `${member.name} Joined`,
          description: member.role ? `Joined as ${member.role}` : 'Joined the band',
          eventType: 'member_joined',
          eventDate: member.joinDate,
          workspaceId,
          createdById: req.user.id
        });
      }
      // Add member left events
      if (member.leftDate && !await eventExists('member_left', member.name)) {
        events.push({
          title: `${member.name} Left`,
          description: 'Left the band',
          eventType: 'member_left',
          eventDate: member.leftDate,
          workspaceId,
          createdById: req.user.id
        });
      }
    }

    // Get all past rehearsals
    const rehearsals = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'REHEARSAL',
        date: { lt: now },
        status: { not: 'CANCELLED' }
      },
      orderBy: { date: 'asc' }
    });

    // First rehearsal
    if (rehearsals.length > 0 && !await eventExists('milestone', 'First Rehearsal')) {
      events.push({
        title: 'First Rehearsal',
        description: 'Our first practice session',
        eventType: 'milestone',
        eventDate: rehearsals[0].date,
        workspaceId,
        createdById: req.user.id
      });
    }

    // Rehearsal milestones
    const rehearsalMilestones = [10, 25, 50, 100];
    for (const milestone of rehearsalMilestones) {
      if (rehearsals.length >= milestone && !await eventExists('milestone', `${milestone} Rehearsals`)) {
        events.push({
          title: `${milestone} Rehearsals`,
          description: `We've practiced ${milestone} times!`,
          eventType: 'milestone',
          eventDate: rehearsals[milestone - 1].date,
          workspaceId,
          createdById: req.user.id
        });
      }
    }

    // Get all past gigs
    const gigs = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'GIG',
        date: { lt: now },
        status: { not: 'CANCELLED' }
      },
      orderBy: { date: 'asc' }
    });

    // First gig
    if (gigs.length > 0 && !await eventExists('first_gig')) {
      events.push({
        title: 'First Gig',
        description: gigs[0].venue ? `Our first show at ${gigs[0].venue}` : 'Our first show!',
        eventType: 'first_gig',
        eventDate: gigs[0].date,
        workspaceId,
        createdById: req.user.id
      });
    }

    // First paid gig
    const firstPaidGig = gigs.find(g => g.pay && g.pay > 0);
    if (firstPaidGig && !await eventExists('milestone', 'First Paid Gig')) {
      events.push({
        title: 'First Paid Gig',
        description: `Our first paying gig${firstPaidGig.venue ? ` at ${firstPaidGig.venue}` : ''}!`,
        eventType: 'milestone',
        eventDate: firstPaidGig.date,
        workspaceId,
        createdById: req.user.id
      });
    }

    // Gig milestones
    const gigMilestones = [10, 25, 50, 100, 250, 500, 1000];
    for (const milestone of gigMilestones) {
      if (gigs.length >= milestone && !await eventExists('milestone', `${milestone} Gigs`)) {
        events.push({
          title: `${milestone} Gigs Milestone`,
          description: `We hit ${milestone} gigs!`,
          eventType: 'milestone',
          eventDate: gigs[milestone - 1].date,
          workspaceId,
          createdById: req.user.id
        });
      }
    }

    // Add individual gig events (only for gigs with venues)
    for (const gig of gigs) {
      if (gig.venue && gig.title) {
        const gigTitle = gig.title || `Gig at ${gig.venue}`;
        if (!await eventExists('custom', gigTitle)) {
          events.push({
            title: gigTitle,
            description: gig.venue,
            eventType: 'custom',
            eventDate: gig.date,
            workspaceId,
            createdById: req.user.id
          });
        }
      }
    }

    // Create all events
    if (events.length > 0) {
      await prisma.timelineEvent.createMany({ data: events });
    }

    // Fetch all events
    const allEvents = await prisma.timelineEvent.findMany({
      where: { workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { eventDate: 'desc' }
    });

    res.json({ created: events.length, events: allEvents });
  } catch (error) {
    console.error('Error generating timeline:', error);
    res.status(500).json({ error: 'Failed to generate timeline' });
  }
});

export default router;
