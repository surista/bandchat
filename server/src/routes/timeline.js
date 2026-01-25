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
router.post('/workspace/:workspaceId/generate', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const now = new Date();
    const events = [];

    // Helper to check if event already exists by exact title
    async function eventExistsByTitle(title) {
      return await prisma.timelineEvent.findFirst({
        where: { workspaceId, title }
      });
    }

    // 1. BAND MEMBERS JOINING/LEAVING
    const members = await prisma.bandMember.findMany({
      where: { workspaceId },
      orderBy: { joinDate: 'asc' }
    });

    for (const member of members) {
      // Member joined
      if (member.joinDate) {
        const joinTitle = `${member.name} Joined`;
        if (!await eventExistsByTitle(joinTitle)) {
          events.push({
            title: joinTitle,
            description: member.role ? `Joined as ${member.role}` : 'Joined the band',
            eventType: 'member_joined',
            eventDate: member.joinDate,
            workspaceId,
            createdById: req.user.id
          });
        }
      }
      // Member left
      if (member.leftDate) {
        const leftTitle = `${member.name} Left`;
        if (!await eventExistsByTitle(leftTitle)) {
          events.push({
            title: leftTitle,
            description: 'Left the band',
            eventType: 'member_left',
            eventDate: member.leftDate,
            workspaceId,
            createdById: req.user.id
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
    if (rehearsals.length >= 1 && !await eventExistsByTitle('First Rehearsal')) {
      events.push({
        title: 'First Rehearsal',
        description: 'Our first practice session',
        eventType: 'milestone',
        eventDate: rehearsals[0].date,
        workspaceId,
        createdById: req.user.id
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
        if (!await eventExistsByTitle(title)) {
          events.push({
            title,
            description: `We've practiced ${milestone} times!`,
            eventType: 'milestone',
            eventDate: rehearsals[milestone - 1].date,
            workspaceId,
            createdById: req.user.id
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
      if (!await eventExistsByTitle(title)) {
        events.push({
          title,
          description: `We've logged ${hours} hours of rehearsal time!`,
          eventType: 'milestone',
          eventDate: date,
          workspaceId,
          createdById: req.user.id
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

    // First gig
    if (gigs.length >= 1 && !await eventExistsByTitle('First Gig')) {
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
    if (firstPaidGig && !await eventExistsByTitle('First Paid Gig')) {
      events.push({
        title: 'First Paid Gig',
        description: `Our first paying gig${firstPaidGig.venue ? ` at ${firstPaidGig.venue}` : ''}!`,
        eventType: 'milestone',
        eventDate: firstPaidGig.date,
        workspaceId,
        createdById: req.user.id
      });
    }

    // ALL subsequent gigs (skip the first one since it has its own event)
    for (let i = 1; i < gigs.length; i++) {
      const gig = gigs[i];
      const gigTitle = gig.title || (gig.venue ? `Gig at ${gig.venue}` : `Gig #${i + 1}`);
      if (!await eventExistsByTitle(gigTitle)) {
        events.push({
          title: gigTitle,
          description: gig.venue || '',
          eventType: 'gig',
          eventDate: gig.date,
          workspaceId,
          createdById: req.user.id
        });
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
