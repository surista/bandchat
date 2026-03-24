import express from 'express';
import { authenticate, isChannelMember } from '../middleware/auth.js';
import { messageLimiter, searchLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { sendPushToUser } from './push.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';

// L7: Allowed attachment types and size limits for validation
const ALLOWED_ATTACHMENT_TYPES = ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'];
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB (video max)

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
    const take = Math.min(parseInt(limit) || 50, 100);

    // Validate cursor format (must be a CUID if provided)
    if (cursor && (typeof cursor !== 'string' || cursor.length < 20 || cursor.length > 30)) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }

    // Check message retention limit based on plan (use channel from middleware to avoid null dereference)
    const channelWorkspaceId = req.channel?.workspaceId;
    if (!channelWorkspaceId) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: channelWorkspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    const retentionFilter = limits.messageRetentionDays
      ? { gte: new Date(Date.now() - limits.messageRetentionDays * 86400000) }
      : undefined;

    // Get blocked user IDs for filtering
    const blockedUsers = await prisma.blockedUser.findMany({
      where: { blockerId: req.user.id },
      select: { blockedUserId: true }
    });
    const blockedIds = blockedUsers.map(b => b.blockedUserId);

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.channelId,
        parentId: null, // Only get top-level messages
        ...(blockedIds.length > 0 && { authorId: { notIn: blockedIds } }),
        ...(retentionFilter && { createdAt: retentionFilter })
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

      // Separate threads that have specific read timestamps from those using channel default
      const threadsWithCustomRead = threadIds.filter(id => threadReadMap[id]);
      const threadsWithDefaultRead = threadIds.filter(id => !threadReadMap[id]);

      // Use a single groupBy query for threads using the common channelLastRead
      if (threadsWithDefaultRead.length > 0) {
        const unreadCounts = await prisma.message.groupBy({
          by: ['parentId'],
          where: {
            parentId: { in: threadsWithDefaultRead },
            authorId: { not: req.user.id },
            createdAt: { gt: channelLastRead }
          },
          _count: { id: true }
        });
        unreadCounts.forEach(item => {
          unreadMap[item.parentId] = item._count.id;
        });
      }

      // For threads with custom per-thread read timestamps, query each one
      // (N is typically small - only threads where user has a custom read position)
      if (threadsWithCustomRead.length > 0) {
        const customCounts = await Promise.all(
          threadsWithCustomRead.map(async (parentId) => {
            const count = await prisma.message.count({
              where: {
                parentId,
                authorId: { not: req.user.id },
                createdAt: { gt: threadReadMap[parentId] }
              }
            });
            return { parentId, count };
          })
        );

        customCounts.forEach(row => {
          unreadMap[row.parentId] = row.count || 0;
        });
      }
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

// Get thread replies (paginated, max 200 per page)
router.get('/:messageId/replies', authenticate, async (req, res) => {
  try {
    const { cursor } = req.query;
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

    // Get blocked user IDs for filtering
    const blockedUsers = await prisma.blockedUser.findMany({
      where: { blockerId: req.user.id },
      select: { blockedUserId: true }
    });
    const blockedIds = blockedUsers.map(b => b.blockedUserId);

    const take = 200;
    const replies = await prisma.message.findMany({
      where: {
        parentId: req.params.messageId,
        ...(blockedIds.length > 0 && { authorId: { notIn: blockedIds } })
      },
      take: take + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1
      }),
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

    const hasMore = replies.length > take;
    const items = hasMore ? replies.slice(0, take) : replies;

    res.json({
      replies: items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get replies' });
  }
});

// Create a message
router.post('/channel/:channelId', authenticate, messageLimiter, isChannelMember, async (req, res) => {
  try {
    const { content, parentId, attachments } = req.body;

    // Limit attachments per message
    if (attachments && attachments.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 attachments per message' });
    }

    // Allow messages with either content or attachments (or both)
    const hasContent = content && content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      return res.status(400).json({ error: 'Message content or attachments required' });
    }

    if (content && content.length > 10000) {
      return res.status(400).json({ error: 'Message too long (max 10,000 characters)' });
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
            create: attachments.filter(att => {
              // Validate URL is from allowed upload provider
              if (!isAllowedUploadUrl(att.url).valid) return false;
              // L7: Validate attachment type is one of the allowed values
              if (!att.type || !ALLOWED_ATTACHMENT_TYPES.includes(att.type)) return false;
              // L7: Validate size is a reasonable positive number
              if (typeof att.size !== 'number' || att.size <= 0 || att.size > MAX_ATTACHMENT_SIZE) return false;
              // L3: Validate thumbnailUrl if provided
              if (att.thumbnailUrl && !isAllowedUploadUrl(att.thumbnailUrl).valid) return false;
              return true;
            }).map(att => ({
              type: att.type,
              url: att.url,
              filename: typeof att.filename === 'string' ? att.filename.replace(/[<>"'\\]/g, '_').replace(/\.\./g, '_').substring(0, 255) : null,
              size: att.size,
              ...(att.thumbnailUrl && { thumbnailUrl: att.thumbnailUrl }),
              ...(att.width && { width: att.width }),
              ...(att.height && { height: att.height })
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

    // --- Push notification logic ---
    const channel = req.channel;
    const notifiedUserIds = new Set(); // Track who's been notified to prevent duplicates
    const pushBody = content
      ? (content.length > 100 ? content.substring(0, 100) + '...' : content)
      : 'Sent an attachment';
    const pushUrl = `/workspace/${channel.workspaceId}?channel=${req.params.channelId}`;
    const pushBase = { channelId: req.params.channelId, workspaceId: channel.workspaceId, threadId: req.params.channelId };

    // 1. DM notifications (to other participants, unless muted)
    if (channel.isDirect) {
      const dmMembers = await prisma.channelMember.findMany({
        where: { channelId: req.params.channelId, userId: { not: req.user.id } },
        select: { userId: true, muted: true }
      });
      dmMembers.filter(m => !m.muted).forEach(m => {
        notifiedUserIds.add(m.userId);
        sendPushToUser(m.userId, {
          title: req.user.displayName,
          body: pushBody,
          tag: `dm-${req.params.channelId}`,
          url: pushUrl,
          ...pushBase
        }, { category: 'dm', workspaceId: channel.workspaceId });
      });
    }

    // 2-3. @channel/@everyone/@here and individual @mention notifications
    if (content && content.includes('@') && !channel.isDirect) {
      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId },
        include: { user: { select: { id: true, displayName: true } } }
      });
      const contentLower = content.toLowerCase();

      // Get all channel members' mute status (needed for both group and individual mentions)
      const allChannelMembers = await prisma.channelMember.findMany({
        where: { channelId: req.params.channelId },
        select: { userId: true, muted: true }
      });
      const mutedUserIds = new Set(allChannelMembers.filter(m => m.muted).map(m => m.userId));
      const channelMemberIds = new Set(allChannelMembers.map(m => m.userId));

      // 2. @channel / @everyone / @here — notify all channel members
      const hasGroupMention = /@(channel|everyone|here)\b/.test(contentLower);
      if (hasGroupMention) {
        allChannelMembers
          .filter(m => m.userId !== req.user.id && !m.muted)
          .forEach(m => {
            notifiedUserIds.add(m.userId);
            sendPushToUser(m.userId, {
              title: `#${channel.name}`,
              body: `${req.user.displayName}: ${pushBody}`,
              tag: `channel-${req.params.channelId}-${message.id}`,
              url: pushUrl,
              ...pushBase
            }, { category: 'mention', workspaceId: channel.workspaceId });
          });
      }

      // 3. Individual @name mentions (skip users already notified via group mention)
      // Uses word boundary matching to prevent false positives (e.g., "@al" matching "@alice")
      const mentionedUsers = workspaceMembers.filter(m => {
        const name = m.user.displayName?.toLowerCase();
        if (!name || name.length < 2) return false; // Skip very short names to prevent noise
        const pattern = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$|\\s|[,;!?.])`, 'i');
        return pattern.test(contentLower);
      });

      mentionedUsers
        .filter(m => m.userId !== req.user.id && !notifiedUserIds.has(m.userId))
        .forEach(m => {
          io.to(`user:${m.userId}`).emit('mention', {
            channelId: req.params.channelId,
            message,
            mentionedBy: req.user
          });

          if (mutedUserIds.has(m.userId)) return;
          notifiedUserIds.add(m.userId);
          sendPushToUser(m.userId, {
            title: `${req.user.displayName} mentioned you`,
            body: pushBody,
            tag: `mention-${message.id}`,
            url: pushUrl,
            ...pushBase
          }, { category: 'mention', workspaceId: channel.workspaceId });
        });
    }

    // 4. Thread reply notifications (notify thread participants)
    if (parentId && !channel.isDirect) {
      // Get all authors who participated in this thread + the parent author
      const [parentMsg, threadReplies] = await Promise.all([
        prisma.message.findUnique({ where: { id: parentId }, select: { authorId: true } }),
        prisma.message.findMany({ where: { parentId }, select: { authorId: true }, distinct: ['authorId'] })
      ]);

      const participantIds = new Set(threadReplies.map(r => r.authorId).filter(Boolean));
      if (parentMsg?.authorId) participantIds.add(parentMsg.authorId);
      participantIds.delete(req.user.id); // Exclude sender

      // Check mute status for participants
      const participantMutes = participantIds.size > 0
        ? await prisma.channelMember.findMany({
            where: { channelId: req.params.channelId, userId: { in: [...participantIds] } },
            select: { userId: true, muted: true }
          })
        : [];
      const mutedParticipants = new Set(participantMutes.filter(m => m.muted).map(m => m.userId));

      for (const userId of participantIds) {
        if (notifiedUserIds.has(userId) || mutedParticipants.has(userId)) continue;
        notifiedUserIds.add(userId);
        sendPushToUser(userId, {
          title: `Thread reply in #${channel.name}`,
          body: `${req.user.displayName}: ${pushBody}`,
          tag: `thread-${parentId}`,
          url: pushUrl,
          ...pushBase,
          threadId: parentId, // Group thread replies together on iOS
        }, { category: 'mention', workspaceId: channel.workspaceId });
      }
    }

    // 5. Channel message notifications (opt-in via notifyChannelMessages)
    // Only fetch members who have opted in to reduce DB overhead
    if (!channel.isDirect) {
      const optedInMembers = await prisma.workspaceMember.findMany({
        where: {
          workspaceId: channel.workspaceId,
          notifyChannelMessages: true,
          userId: { not: req.user.id, notIn: [...notifiedUserIds] }
        },
        select: { userId: true }
      });
      if (optedInMembers.length > 0) {
        // Check mute status for opted-in members
        const optedInIds = optedInMembers.map(m => m.userId);
        const mutedOptedIn = await prisma.channelMember.findMany({
          where: { channelId: req.params.channelId, userId: { in: optedInIds }, muted: true },
          select: { userId: true }
        });
        const mutedOptedInSet = new Set(mutedOptedIn.map(m => m.userId));
        optedInMembers.filter(m => !mutedOptedInSet.has(m.userId)).forEach(m => {
          sendPushToUser(m.userId, {
            title: `#${channel.name}`,
            body: `${req.user.displayName}: ${pushBody}`,
            tag: `channel-${req.params.channelId}`,
            url: pushUrl,
            ...pushBase
          }, { category: 'channel', workspaceId: channel.workspaceId });
        });
      }
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

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 10000) {
      return res.status(400).json({ error: 'Message too long (max 10,000 characters)' });
    }

    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: { select: { workspaceId: true } } }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify workspace membership
    const wsMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!wsMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
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

// Toggle link preview visibility on a message (author only)
router.patch('/:messageId/preview', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      select: { authorId: true, channelId: true, hidePreview: true }
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Can only modify your own messages' });
    }

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { hidePreview: !message.hidePreview },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: true,
        ...reactionsInclude,
        _count: { select: { replies: true } }
      }
    });

    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:updated', updated);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preview visibility' });
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

    // Verify workspace membership first
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Check if user is author or workspace admin
    const isAuthor = message.authorId === req.user.id;

    if (!isAuthor && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete this message' });
    }

    // Clean up R2 files and track storage before cascade delete
    const attachments = await prisma.attachment.findMany({
      where: { messageId: req.params.messageId },
      select: { url: true, size: true },
    });
    let freedBytes = 0;
    for (const att of attachments) {
      if (isR2Url(att.url)) {
        try { await deleteFile(att.url); } catch { /* best effort */ }
      }
      freedBytes += att.size || 0;
    }
    if (freedBytes > 0) {
      await safeDecrementStorage(message.channel.workspaceId, freedBytes).catch(() => {});
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
router.get('/search/:workspaceId', authenticate, searchLimiter, async (req, res) => {
  try {
    const { q, channelId, authorId, limit: rawLimit = 20 } = req.query;
    const limit = Math.min(parseInt(rawLimit), 100);

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

    // Get blocked user IDs for filtering
    const blockedUsers = await prisma.blockedUser.findMany({
      where: { blockerId: req.user.id },
      select: { blockedUserId: true }
    });
    const blockedIds = blockedUsers.map(b => b.blockedUserId);

    // Build authorId filter: combine author filter + blocked users filter without overwriting
    const authorFilter = [];
    if (authorId) authorFilter.push({ authorId });
    if (blockedIds.length > 0) authorFilter.push({ authorId: { notIn: blockedIds } });

    // Validate channelId is in accessible channels (prevent private channel bypass)
    const accessibleIds = accessibleChannels.map(c => c.id);
    const channelFilter = channelId && accessibleIds.includes(channelId)
      ? { channelId }
      : { channelId: { in: accessibleIds } };

    const messages = await prisma.message.findMany({
      where: {
        ...channelFilter,
        content: { contains: q.trim(), mode: 'insensitive' },
        ...(authorFilter.length > 0 && { AND: authorFilter })
      },
      take: limit,
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

// Get timeline (all messages across accessible channels)
router.get('/timeline/:workspaceId', authenticate, searchLimiter, async (req, res) => {
  try {
    const { cursor, limit = 50 } = req.query;
    const take = Math.min(parseInt(limit) || 50, 100);

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

    // Get channels user has access to (public + private where member)
    const accessibleChannels = await prisma.channel.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.user.id } } }
        ]
      },
      select: { id: true }
    });

    // Return empty if no accessible channels
    if (accessibleChannels.length === 0) {
      return res.json({ messages: [], nextCursor: null, hasMore: false });
    }

    // Get blocked user IDs for filtering
    const blockedUsers = await prisma.blockedUser.findMany({
      where: { blockerId: req.user.id },
      select: { blockedUserId: true }
    });
    const blockedIds = blockedUsers.map(b => b.blockedUserId);

    // Fetch timeline messages
    const messages = await prisma.message.findMany({
      where: {
        channelId: { in: accessibleChannels.map(c => c.id) },
        parentId: null, // Only top-level messages
        ...(blockedIds.length > 0 && { authorId: { notIn: blockedIds } })
      },
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true }
        },
        channel: {
          select: {
            id: true, name: true, isDirect: true,
            members: {
              select: { user: { select: { id: true, displayName: true } } },
              take: 5
            }
          }
        },
        attachments: true,
        ...reactionsInclude,
        _count: { select: { replies: true } }
      }
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;

    res.json({
      messages: items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore
    });
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// Add a reaction to a message
router.post('/:messageId/reactions', authenticate, async (req, res) => {
  try {
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    if (emoji.length > 32) {
      return res.status(400).json({ error: 'Invalid emoji' });
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
      reaction,
      channelId: channel.id
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
      include: { channel: { select: { id: true, workspaceId: true } } }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
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
      userId: req.user.id,
      channelId: message.channelId
    });

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Pin a message
router.post('/:messageId/pin', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user is a workspace member
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Create pinned message (upsert to avoid duplicates)
    const pinnedMessage = await prisma.pinnedMessage.upsert({
      where: {
        messageId_channelId: {
          messageId: req.params.messageId,
          channelId: message.channelId
        }
      },
      update: {},
      create: {
        messageId: req.params.messageId,
        channelId: message.channelId,
        pinnedById: req.user.id
      },
      include: {
        message: {
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
        },
        pinnedBy: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    // Broadcast via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:pinned', pinnedMessage);

    res.status(201).json(pinnedMessage);
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Unpin a message
router.delete('/:messageId/pin', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user is a workspace member
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const pinnedMessage = await prisma.pinnedMessage.findUnique({
      where: {
        messageId_channelId: {
          messageId: req.params.messageId,
          channelId: message.channelId
        }
      }
    });

    if (!pinnedMessage) {
      return res.status(404).json({ error: 'Message is not pinned' });
    }

    await prisma.pinnedMessage.delete({
      where: { id: pinnedMessage.id }
    });

    // Broadcast via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:unpinned', {
      messageId: req.params.messageId,
      channelId: message.channelId
    });

    res.json({ message: 'Message unpinned' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// Get pinned messages for a channel
router.get('/channel/:channelId/pins', authenticate, async (req, res) => {
  try {
    // Verify user has access to the channel
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

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

    // If channel is private, verify the user is a member of the channel
    if (channel.isPrivate) {
      const channelMembership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: {
            userId: req.user.id,
            channelId: req.params.channelId
          }
        }
      });

      if (!channelMembership) {
        return res.status(403).json({ error: 'Not a member of this private channel' });
      }
    }

    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { channelId: req.params.channelId },
      orderBy: { createdAt: 'desc' },
      include: {
        message: {
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
        },
        pinnedBy: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    res.json(pinnedMessages);
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ error: 'Failed to get pinned messages' });
  }
});

// Get "seen by" info for a message
router.get('/:messageId/seen-by', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify workspace membership
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    // Find channel members whose lastRead >= message.createdAt
    const seenMembers = await prisma.channelMember.findMany({
      where: {
        channelId: message.channelId,
        lastRead: { gte: message.createdAt },
        userId: { not: message.authorId }
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    const totalMembers = await prisma.channelMember.count({
      where: { channelId: message.channelId }
    });

    res.json({
      seenBy: seenMembers.map(m => m.user),
      totalMembers
    });
  } catch (error) {
    console.error('Get seen-by error:', error);
    res.status(500).json({ error: 'Failed to get seen-by info' });
  }
});

// Mark a thread as read
router.post('/:messageId/thread-read', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user has access to the channel (same pattern as replies endpoint)
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

// Save (bookmark) a message
router.post('/:messageId/save', authenticate, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { channel: true }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify workspace membership
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: message.channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const saved = await prisma.savedMessage.upsert({
      where: {
        userId_messageId: {
          userId: req.user.id,
          messageId: req.params.messageId
        }
      },
      update: {},
      create: {
        userId: req.user.id,
        messageId: req.params.messageId
      }
    });

    res.status(201).json(saved);
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Unsave (unbookmark) a message
router.delete('/:messageId/save', authenticate, async (req, res) => {
  try {
    const saved = await prisma.savedMessage.findUnique({
      where: {
        userId_messageId: {
          userId: req.user.id,
          messageId: req.params.messageId
        }
      }
    });

    if (!saved) {
      return res.status(404).json({ error: 'Message is not saved' });
    }

    await prisma.savedMessage.delete({
      where: { id: saved.id }
    });

    res.json({ message: 'Message unsaved' });
  } catch (error) {
    console.error('Unsave message error:', error);
    res.status(500).json({ error: 'Failed to unsave message' });
  }
});

// Get saved messages for current user in a workspace
router.get('/workspace/:workspaceId/saved', authenticate, async (req, res) => {
  try {
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: req.params.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const savedMessages = await prisma.savedMessage.findMany({
      where: {
        userId: req.user.id,
        message: {
          channel: {
            workspaceId: req.params.workspaceId
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        message: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            },
            attachments: true,
            channel: {
              select: {
                id: true,
                name: true,
                isDirect: true
              }
            }
          }
        }
      }
    });

    res.json(savedMessages);
  } catch (error) {
    console.error('Get saved messages error:', error);
    res.status(500).json({ error: 'Failed to get saved messages' });
  }
});

export default router;
