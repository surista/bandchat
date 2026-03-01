import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all polls for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { channelId, includeCompleted } = req.query;

    const polls = await prisma.poll.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        ...(channelId && { channelId }),
        ...(includeCompleted !== 'true' && { isClosed: false })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        channel: {
          select: { id: true, name: true }
        },
        options: {
          include: {
            votes: {
              include: {
                user: {
                  select: { id: true, displayName: true }
                }
              }
            },
            _count: {
              select: { votes: true }
            }
          },
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate results and hide votes if anonymous
    const result = polls.map(poll => {
      const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
      const userVotes = poll.options
        .filter(opt => opt.votes.some(v => v.user.id === req.user.id))
        .map(opt => opt.id);

      return {
        ...poll,
        totalVotes,
        userVotes,
        options: poll.options.map(opt => ({
          id: opt.id,
          text: opt.text,
          position: opt.position,
          voteCount: opt._count.votes,
          percentage: totalVotes > 0 ? Math.round((opt._count.votes / totalVotes) * 100) : 0,
          // Only show voters if not anonymous
          voters: poll.isAnonymous ? [] : opt.votes.map(v => v.user)
        }))
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get polls error:', error);
    res.status(500).json({ error: 'Failed to get polls' });
  }
});

// Create a poll
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { question, description, options, allowMultiple, isAnonymous, channelId, expiresAt } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (question.length > 500) return res.status(400).json({ error: 'Question must be 500 characters or less' });

    if (!options || options.length < 2) {
      return res.status(400).json({ error: 'At least 2 options are required' });
    }

    if (options.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 options allowed' });
    }

    const poll = await prisma.poll.create({
      data: {
        question,
        description,
        allowMultiple: allowMultiple || false,
        isAnonymous: isAnonymous || false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        workspaceId: req.params.workspaceId,
        channelId: channelId || null,
        createdById: req.user.id,
        options: {
          create: options.map((text, index) => ({
            text,
            position: index
          }))
        }
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        channel: {
          select: { id: true, name: true }
        },
        options: {
          orderBy: { position: 'asc' }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('poll:created', poll);

    res.status(201).json(poll);
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Get a single poll
router.get('/:pollId', authenticate, async (req, res) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.pollId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        channel: {
          select: { id: true, name: true }
        },
        options: {
          include: {
            votes: {
              include: {
                user: {
                  select: { id: true, displayName: true }
                }
              }
            },
            _count: {
              select: { votes: true }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: poll.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);
    const userVotes = poll.options
      .filter(opt => opt.votes.some(v => v.user.id === req.user.id))
      .map(opt => opt.id);

    res.json({
      ...poll,
      totalVotes,
      userVotes,
      options: poll.options.map(opt => ({
        id: opt.id,
        text: opt.text,
        position: opt.position,
        voteCount: opt._count.votes,
        percentage: totalVotes > 0 ? Math.round((opt._count.votes / totalVotes) * 100) : 0,
        voters: poll.isAnonymous ? [] : opt.votes.map(v => v.user)
      }))
    });
  } catch (error) {
    console.error('Get poll error:', error);
    res.status(500).json({ error: 'Failed to get poll' });
  }
});

// Vote on a poll
router.post('/:pollId/vote', authenticate, async (req, res) => {
  try {
    const { optionIds } = req.body;

    if (!optionIds || optionIds.length === 0) {
      return res.status(400).json({ error: 'At least one option must be selected' });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: req.params.pollId },
      include: {
        options: {
          include: {
            votes: true
          }
        }
      }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: poll.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (poll.isClosed) {
      return res.status(400).json({ error: 'Poll is closed' });
    }

    if (poll.expiresAt && new Date() > poll.expiresAt) {
      return res.status(400).json({ error: 'Poll has expired' });
    }

    if (!poll.allowMultiple && optionIds.length > 1) {
      return res.status(400).json({ error: 'Only one option can be selected' });
    }

    // Verify all optionIds belong to this poll
    const validOptionIds = poll.options.map(o => o.id);
    const invalidOptions = optionIds.filter(id => !validOptionIds.includes(id));
    if (invalidOptions.length > 0) {
      return res.status(400).json({ error: 'Invalid option selected' });
    }

    // Remove existing votes and create new ones atomically
    await prisma.$transaction([
      prisma.pollVote.deleteMany({
        where: {
          userId: req.user.id,
          option: {
            pollId: req.params.pollId
          }
        }
      }),
      prisma.pollVote.createMany({
        data: optionIds.map(optionId => ({
          optionId,
          userId: req.user.id
        }))
      })
    ]);

    // Fetch updated poll
    const updatedPoll = await prisma.poll.findUnique({
      where: { id: req.params.pollId },
      include: {
        options: {
          include: {
            votes: {
              include: {
                user: {
                  select: { id: true, displayName: true }
                }
              }
            },
            _count: {
              select: { votes: true }
            }
          },
          orderBy: { position: 'asc' }
        }
      }
    });

    const totalVotes = updatedPoll.options.reduce((sum, opt) => sum + opt._count.votes, 0);

    const result = {
      pollId: req.params.pollId,
      totalVotes,
      options: updatedPoll.options.map(opt => ({
        id: opt.id,
        voteCount: opt._count.votes,
        percentage: totalVotes > 0 ? Math.round((opt._count.votes / totalVotes) * 100) : 0,
        voters: updatedPoll.isAnonymous ? [] : opt.votes.map(v => v.user)
      }))
    };

    // Broadcast vote update
    const io = req.app.get('io');
    io.to(`workspace:${poll.workspaceId}`).emit('poll:voted', result);

    res.json(result);
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// Close a poll (creator or admin only)
router.post('/:pollId/close', authenticate, async (req, res) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.pollId }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: poll.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (poll.createdById !== req.user.id && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the poll creator or admin can close this poll' });
    }

    const updatedPoll = await prisma.poll.update({
      where: { id: req.params.pollId },
      data: { isClosed: true }
    });

    // Broadcast closure
    const io = req.app.get('io');
    io.to(`workspace:${poll.workspaceId}`).emit('poll:closed', { pollId: req.params.pollId });

    res.json(updatedPoll);
  } catch (error) {
    console.error('Close poll error:', error);
    res.status(500).json({ error: 'Failed to close poll' });
  }
});

// Delete a poll (creator or admin only)
router.delete('/:pollId', authenticate, async (req, res) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.pollId }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: poll.workspaceId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (poll.createdById !== req.user.id && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the poll creator or admin can delete this poll' });
    }

    await prisma.poll.delete({
      where: { id: req.params.pollId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${poll.workspaceId}`).emit('poll:deleted', { pollId: req.params.pollId });

    res.json({ message: 'Poll deleted' });
  } catch (error) {
    console.error('Delete poll error:', error);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});

export default router;
