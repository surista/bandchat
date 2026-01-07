import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, isChannelMember } from '../middleware/auth.js';
import { sendPushToUser } from './push.js';

const router = express.Router();
const prisma = new PrismaClient();

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
        _count: {
          select: { replies: true }
        }
      }
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;

    res.json({
      messages: items.reverse(), // Return in chronological order
      nextCursor: hasMore ? items[0].id : null,
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
        attachments: true
      }
    });

    res.json(replies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get replies' });
  }
});

// Create a message
router.post('/channel/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { content, parentId, attachments } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
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
        content: content.trim(),
        authorId: req.user.id,
        channelId: req.params.channelId,
        parentId,
        ...(attachments && attachments.length > 0 && {
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

export default router;
