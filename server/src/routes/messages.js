import express from 'express';
import { authenticate, isChannelMember } from '../middleware/auth.js';
import { messageLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { sendPushToUser } from './push.js';

const router = express.Router();

// Reusable include for reactions
const reactionsInclude = {
  reactions: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  }
};

// Get messages for a channel (paginated)
router.get('/channel/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { cursor, limit = 50 } = req.query;
    const take = Math.min(parseInt(limit), 100);

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.channelId,
        parentId: null // Only get top-level messages
      },
      take: take + 1, // Get one extra to check if there are more
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        ...reactionsInclude,
        _count: {
          select: { replies: true }
        }
      }
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;
    const result = items.reverse(); // Return in chronological order

    // Compute unreadReplies for messages that have threads
    const threadIds = result.filter(m => m._count.replies > 0).map(m => m.id);
    let unreadMap = {};

    if (threadIds.length > 0) {
      // Get user's ThreadRead records for these parent messages
      const threadReads = await prisma.threadRead.findMany({
        where: {
          userId: req.user.id,
          messageId: { in: threadIds }
        }
      });
      const threadReadMap = Object.fromEntries(threadReads.map(tr => [tr.messageId, tr.lastRead]));

      // Get user's channel lastRead as fallback
      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: {
            userId: req.user.id,
            channelId: req.params.channelId
          }
        }
      });
      const channelLastRead = membership?.lastRead || new Date(0);

      // Count unread replies for each threaded message
      const counts = await Promise.all(threadIds.map(async (id) => {
        const lastRead = threadReadMap[id] || channelLastRead;
        const count = await prisma.message.count({
          where: {
            parentId: id,
            createdAt: { gt: lastRead },
            authorId: { not: req.user.id }
          }
        });
        return [id, count];
      }));
      unreadMap = Object.fromEntries(counts);
    }

    const enriched = result.map(m => ({
      ...m,
      unreadReplies: unreadMap[m.id] || 0
    }));

    res.json({
      messages: enriched,
      nextCursor: hasMore ? enriched[0].id : null,
      hasMore
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Get thread replies
router.get('/:messageId/replies', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user has access to the channel
    const channel = message.channel;
    if (channel.isPrivate) {
      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: {
            userId: req.user.id,
            channelId: channel.id
          }
        }
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this channel' });
      }
    }

    const replies = await prisma.message.findMany({
      where: { parentId: req.params.messageId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        ...reactionsInclude
      }
    });

    res.json(replies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get replies' });
  }
});

// Create a message
router.post('/channel/:channelId', authenticate, messageLimiter, isChannelMember, async (req, res) => {
  try {
    const { content, parentId, attachments } = req.body;

    // Allow messages with either content or attachments (or both)
    const hasContent = content && content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      return res.status(400).json({ error: 'Message content or attachments required' });
    }

    // If this is a reply, verify parent message exists and is in same channel
    if (parentId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentId }
      });

      if (!parentMessage || parentMessage.channelId !== req.params.channelId) {
        return res.status(400).json({ error: 'Invalid parent message' });
      }

      // Don't allow nested threads (reply to a reply)
      if (parentMessage.parentId) {
        return res.status(400).json({ error: 'Cannot reply to a reply' });
      }
    }

    const message = await prisma.message.create({
      data: {
        content: hasContent ? content.trim() : '',
        authorId: req.user.id,
        channelId: req.params.channelId,
        parentId,
        ...(hasAttachments && {
          attachments: {
            create: attachments.map(att => ({
              type: att.type,
              url: att.url,
              filename: att.filename,
              size: att.size
            }))
          }
        })
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        ...reactionsInclude,
        _count: {
          select: { replies: true }
        }
      }
    });

    // Broadcast message via socket
    const io = req.app.get('io');

    if (parentId) {
      // Thread reply
      io.to(`channel:${req.params.channelId}`).emit('message:reply', {
        parentId,
        message
      });
    } else {
      // Regular message
      io.to(`channel:${req.params.channelId}`).emit('message:new', message);
    }

    // Extract mentions and notify
    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      const channel = req.channel;
      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId },
        include: {
          user: {
            select: { id: true, displayName: true }
          }
        }
      });

      const mentionedUsers = workspaceMembers.filter(m =>
        mentions.some(mention =>
          mention.slice(1).toLowerCase() === m.user.displayName.toLowerCase()
        )
      );

      mentionedUsers.forEach(m => {
        io.to(`user:${m.userId}`).emit('mention', {
          channelId: req.params.channelId,
          message,
          mentionedBy: req.user
        });

        // Send push notification
        sendPushToUser(m.userId, {
          title: `${req.user.displayName} mentioned you`,
          body: content.length > 100 ? content.substring(0, 100) + '...' : content,
          tag: `mention-${message.id}`,
          url: `/workspace/${channel.workspaceId}?channel=${req.params.channelId}`,
          channelId: req.params.channelId,
          workspaceId: channel.workspaceId
        });
      });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// Update a message
router.put('/:messageId', authenticate, async (req, res) => {
  try {
    const { content } = req.body;

    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Can only edit your own messages' });
    }

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { content: content.trim() },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        attachments: true,
        ...reactionsInclude,
        _count: {
          select: { replies: true }
        }
      }
    });

    // Broadcast update via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:updated', updated);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// Delete a message
router.delete('/:messageId', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is author or workspace admin
    const isAuthor = message.authorId === req.user.id;

    if (!isAuthor) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.user.id,
            workspaceId: message.channel.workspaceId
          }
        }
      });

      if (!membership || membership.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Cannot delete this message' });
      }
    }

    await prisma.message.delete({
      where: { id: req.params.messageId }
    });

    // Broadcast deletion via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:deleted', {
      messageId: req.params.messageId,
      parentId: message.parentId
    });

    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Search messages in a workspace
router.get('/search/:workspaceId', authenticate, async (req, res) => {
  try {
    const { q, channelId, authorId, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    // Verify user is in workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Get channels user has access to
    const accessibleChannels = await prisma.channel.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        OR: [
          { isPrivate: false },
          {
            members: {
              some: { userId: req.user.id }
            }
          }
        ]
      },
      select: { id: true }
    });

    const messages = await prisma.message.findMany({
      where: {
        channelId: { in: accessibleChannels.map(c => c.id) },
        content: { contains: q.trim(), mode: 'insensitive' },
        ...(channelId && { channelId }),
        ...(authorId && { authorId })
      },
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        channel: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Add a reaction to a message
router.post('/:messageId/reactions', authenticate, async (req, res) => {
  try {
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    // Get the message and verify access
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user has access to the channel
    const channel = message.channel;
    if (channel.isPrivate) {
      const membership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: {
            userId: req.user.id,
            channelId: channel.id
          }
        }
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this channel' });
      }
    } else {
      // For public channels, verify workspace membership
      const workspaceMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.user.id,
            workspaceId: channel.workspaceId
          }
        }
      });

      if (!workspaceMember) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }
    }

    // Create or find existing reaction (upsert)
    const reaction = await prisma.reaction.upsert({
      where: {
        userId_messageId_emoji: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji
        }
      },
      update: {},
      create: {
        emoji,
        userId: req.user.id,
        messageId: req.params.messageId
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    // Broadcast reaction via socket
    const io = req.app.get('io');
    io.to(`channel:${channel.id}`).emit('reaction:added', {
      messageId: req.params.messageId,
      reaction
    });

    res.status(201).json(reaction);
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove a reaction from a message
router.delete('/:messageId/reactions/:emoji', authenticate, async (req, res) => {
  try {
    const emoji = decodeURIComponent(req.params.emoji);

    // Get the message to find the channel for socket broadcast
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      select: { channelId: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Find and delete the user's reaction
    const reaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji
        }
      }
    });

    if (!reaction) {
      return res.status(404).json({ error: 'Reaction not found' });
    }

    await prisma.reaction.delete({
      where: { id: reaction.id }
    });

    // Broadcast removal via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('reaction:removed', {
      messageId: req.params.messageId,
      emoji,
      userId: req.user.id
    });

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Mark a thread as read
router.post('/:messageId/thread-read', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      select: { channelId: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user has access to the channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: message.channelId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    await prisma.threadRead.upsert({
      where: {
        userId_messageId: {
          userId: req.user.id,
          messageId: req.params.messageId
        }
      },
      update: { lastRead: new Date() },
      create: {
        userId: req.user.id,
        messageId: req.params.messageId,
        lastRead: new Date()
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark thread read error:', error);
    res.status(500).json({ error: 'Failed to mark thread as read' });
  }
});

export default router;
