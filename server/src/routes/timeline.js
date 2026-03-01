import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

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

    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (description && description.length > 2000) return res.status(400).json({ error: 'Description must be 2,000 characters or less' });

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

// Shared helper: generate timeline events from band data
// When checkExisting is true (generate), skip events that already exist by title.
// When checkExisting is false (regenerate), create all events unconditionally.
async function generateTimelineEvents(workspaceId, createdById, { checkExisting = true } = {}) {
  const now = new Date();
  const events = [];

  // Helper to check if event already exists by exact title
  async function shouldSkip(title) {
    if (!checkExisting) return false;
    return await prisma.timelineEvent.findFirst({
      where: { workspaceId, title }
    });
  }

  // 1. BAND MEMBERS JOINING/LEAVING (skip guests)
  const members = await prisma.bandMember.findMany({
    where: { workspaceId, isGuest: false },
    include: {
      stints: { orderBy: { startDate: 'asc' } }
    }
  });

  for (const member of members) {
    const firstStint = member.stints[0];
    if (firstStint?.startDate) {
      const joinTitle = `${member.name} Joined`;
      if (!await shouldSkip(joinTitle)) {
        const instruments = firstStint.instruments?.join(', ') || '';
        events.push({
          title: joinTitle,
          description: instruments ? `Joined as ${instruments}` : 'Joined the band',
          eventType: 'member_joined',
          eventDate: firstStint.startDate,
          workspaceId,
          createdById
        });
      }
    }

    const lastStint = member.stints[member.stints.length - 1];
    if (lastStint?.endDate) {
      const leftTitle = `${member.name} Left`;
      if (!await shouldSkip(leftTitle)) {
        events.push({
          title: leftTitle,
          description: 'Left the band',
          eventType: 'member_left',
          eventDate: lastStint.endDate,
          workspaceId,
          createdById
        });
      }
    }
  }

  // 2. REHEARSALS
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
  if (rehearsals.length >= 1 && !await shouldSkip('First Rehearsal')) {
    events.push({
      title: 'First Rehearsal',
      description: 'Our first practice session',
      eventType: 'milestone',
      eventDate: rehearsals[0].date,
      workspaceId,
      createdById
    });
  }

  // Rehearsal count milestones: 5, 10, then every 25 (25, 50, 75, 100, etc.)
  const rehearsalMilestones = [5, 10];
  for (let i = 25; i <= rehearsals.length; i += 25) {
    rehearsalMilestones.push(i);
  }

  for (const milestone of rehearsalMilestones) {
    if (rehearsals.length >= milestone) {
      const title = `${milestone} Rehearsals`;
      if (!await shouldSkip(title)) {
        events.push({
          title,
          description: `We've practiced ${milestone} times!`,
          eventType: 'milestone',
          eventDate: rehearsals[milestone - 1].date,
          workspaceId,
          createdById
        });
      }
    }
  }

  // Calculate total rehearsal hours and create hour milestones
  let totalRehearsalHours = 0;
  const rehearsalHourMilestones = []; // { hours: number, date: Date }

  for (const rehearsal of rehearsals) {
    if (rehearsal.endDate) {
      const hours = (new Date(rehearsal.endDate) - new Date(rehearsal.date)) / (1000 * 60 * 60);
      if (hours > 0) {
        const prevHours = totalRehearsalHours;
        totalRehearsalHours += hours;

        // Check milestones: 10, then every 25 (25, 50, 75, 100, etc.)
        const checkMilestones = [10];
        for (let h = 25; h <= totalRehearsalHours; h += 25) {
          checkMilestones.push(h);
        }

        for (const milestone of checkMilestones) {
          if (prevHours < milestone && totalRehearsalHours >= milestone) {
            rehearsalHourMilestones.push({ hours: milestone, date: rehearsal.date });
          }
        }
      }
    }
  }

  // Add rehearsal hour milestone events
  for (const { hours, date } of rehearsalHourMilestones) {
    const title = `${hours} Hours of Practice`;
    if (!await shouldSkip(title)) {
      events.push({
        title,
        description: `We've logged ${hours} hours of rehearsal time!`,
        eventType: 'milestone',
        eventDate: date,
        workspaceId,
        createdById
      });
    }
  }

  // 3. GIGS
  const gigs = await prisma.gig.findMany({
    where: {
      workspaceId,
      type: 'GIG',
      date: { lt: now },
      status: { not: 'CANCELLED' }
    },
    orderBy: { date: 'asc' }
  });

  // Gig milestones: 1st, 5th, 10th, then every 5th (15, 20, 25, etc.)
  const gigMilestones = [1, 5, 10];
  for (let i = 15; i <= gigs.length; i += 5) {
    gigMilestones.push(i);
  }

  for (const milestone of gigMilestones) {
    if (gigs.length >= milestone) {
      const gig = gigs[milestone - 1];
      const title = milestone === 1
        ? 'First Gig'
        : `${milestone}th Gig: ${gig.title || gig.venue || 'Milestone'}`;

      if (!await shouldSkip(title) && (milestone > 1 || !await shouldSkip('First Gig'))) {
        events.push({
          title: milestone === 1 ? 'First Gig' : title,
          description: milestone === 1
            ? (gig.venue ? `Our first show at ${gig.venue}` : 'Our first show!')
            : (gig.venue || ''),
          eventType: milestone === 1 ? 'first_gig' : 'milestone',
          eventDate: gig.date,
          workspaceId,
          createdById
        });
      }
    }
  }

  // First paid gig
  const firstPaidGig = gigs.find(g => g.pay && g.pay > 0);
  if (firstPaidGig && !await shouldSkip('First Paid Gig')) {
    events.push({
      title: 'First Paid Gig',
      description: `Our first paying gig${firstPaidGig.venue ? ` at ${firstPaidGig.venue}` : ''}!`,
      eventType: 'milestone',
      eventDate: firstPaidGig.date,
      workspaceId,
      createdById
    });
  }

  // Create all events
  if (events.length > 0) {
    await prisma.timelineEvent.createMany({ data: events });
  }

  return events;
}

// Auto-generate timeline from actual band data
router.post('/workspace/:workspaceId/generate', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    const events = await generateTimelineEvents(workspaceId, req.user.id, { checkExisting: true });

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

// Regenerate timeline - clears auto-generated events and recreates from current data
router.post('/workspace/:workspaceId/regenerate', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Delete all auto-generated event types (keep custom ones)
    const autoGeneratedTypes = ['first_gig', 'gig', 'milestone', 'member_joined', 'member_left'];
    const deleted = await prisma.timelineEvent.deleteMany({
      where: {
        workspaceId,
        eventType: { in: autoGeneratedTypes }
      }
    });

    const events = await generateTimelineEvents(workspaceId, req.user.id, { checkExisting: false });

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

    res.json({ deleted: deleted.count, created: events.length, events: allEvents });
  } catch (error) {
    console.error('Error regenerating timeline:', error);
    res.status(500).json({ error: 'Failed to regenerate timeline' });
  }
});

export default router;
