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

    const validTypes = ['formation', 'first_gig', 'member_joined', 'member_left', 'album_release', 'milestone', 'custom'];
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

// Auto-generate timeline from gigs data
router.post('/workspace/:workspaceId/generate', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Get first gig
    const firstGig = await prisma.gig.findFirst({
      where: { workspaceId, type: 'GIG', status: 'COMPLETED' },
      orderBy: { date: 'asc' }
    });

    // Get workspace creation date
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    const events = [];

    // Add formation event
    const existingFormation = await prisma.timelineEvent.findFirst({
      where: { workspaceId, eventType: 'formation' }
    });

    if (!existingFormation) {
      events.push({
        title: 'Band Formed',
        description: 'The beginning of our journey',
        eventType: 'formation',
        eventDate: workspace.createdAt,
        workspaceId,
        createdById: req.user.id
      });
    }

    // Add first gig event
    if (firstGig) {
      const existingFirstGig = await prisma.timelineEvent.findFirst({
        where: { workspaceId, eventType: 'first_gig' }
      });

      if (!existingFirstGig) {
        events.push({
          title: 'First Gig',
          description: `Our first show at ${firstGig.venue || 'an awesome venue'}`,
          eventType: 'first_gig',
          eventDate: firstGig.date,
          workspaceId,
          createdById: req.user.id
        });
      }
    }

    // Add milestone events for gig counts
    const gigCount = await prisma.gig.count({
      where: { workspaceId, type: 'GIG', status: 'COMPLETED' }
    });

    const milestones = [10, 25, 50, 100, 250, 500, 1000];
    for (const milestone of milestones) {
      if (gigCount >= milestone) {
        const existingMilestone = await prisma.timelineEvent.findFirst({
          where: {
            workspaceId,
            eventType: 'milestone',
            title: { contains: `${milestone}` }
          }
        });

        if (!existingMilestone) {
          // Find the date of the milestone gig
          const gigs = await prisma.gig.findMany({
            where: { workspaceId, type: 'GIG', status: 'COMPLETED' },
            orderBy: { date: 'asc' },
            skip: milestone - 1,
            take: 1
          });

          if (gigs.length > 0) {
            events.push({
              title: `${milestone} Gigs Milestone`,
              description: `We hit ${milestone} gigs!`,
              eventType: 'milestone',
              eventDate: gigs[0].date,
              workspaceId,
              createdById: req.user.id
            });
          }
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
