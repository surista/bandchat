import express from 'express';
import { authenticate, isChannelMember } from '../middleware/auth.js';
import { messageLimiter, searchLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { sendPushToUser } from './push.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';
import { logAudit } from '../lib/audit.js';
import { emitBadgeUpdate } from '../lib/unreadCount.js';
import { isValidUUID } from '../lib/validators.js';

// L7: Allowed attachment types and size limits for validation
const ALLOWED_ATTACHMENT_TYPES = ['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'];
const MAX_ATTACHMENT_SIZE = 500 * 1024 * 1024; // 500MB (video/audio max — keep in sync with uploads.js)

const router = express.Router();

// Disable HTTP caching on every response from this router. Messages mutate
// constantly (creates, edits, deletes, reactions, pagination cursors) and
// Express's default ETag-based 304 revalidation caused real damage here:
// during the rate-limit incident on 2026-04-25, browsers cached empty
// `{messages:[],hasMore:false}` bodies; subsequent server responses with the
// same body got 304s, the client kept reading hasMore=false from cache,
// the infinite-scroll sentinel never re-rendered, and pagination was stuck
// at the most recent 50 messages until caches were manually cleared.
// no-store ensures no layer (browser, SW, CDN) holds onto these responses.
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

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

    // Validate cursor format. Message IDs are UUIDs (36 chars) — the original
    // length check (20–30) silently rejected every real cursor with 400, which
    // is why scroll-up to load older messages had been broken since v1.05.77
    // (2026-03-24). Symptom looked like "channel only ever shows the most
    // recent 50 messages." Use the proper UUID validator now.
    if (cursor && (typeof cursor !== 'string' || !isValidUUID(cursor))) {
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

      // For threads with custom per-thread read timestamps: one query for all,
      // tally per-parent in JS against each thread's specific read time.
      // (Previously: N parallel point queries, one per thread. For users with
      // many custom thread positions on a chatty channel this was the bulk of
      // the message-load latency.)
      if (threadsWithCustomRead.length > 0) {
        const earliestRead = new Date(
          Math.min(...threadsWithCustomRead.map(id => new Date(threadReadMap[id]).getTime()))
        );
        const candidateReplies = await prisma.message.findMany({
          where: {
            parentId: { in: threadsWithCustomRead },
            authorId: { not: req.user.id },
            createdAt: { gt: earliestRead }
          },
          select: { parentId: true, createdAt: true }
        });
        const counts = {};
        for (const r of candidateReplies) {
          if (new Date(r.createdAt) > new Date(threadReadMap[r.parentId])) {
            counts[r.parentId] = (counts[r.parentId] || 0) + 1;
          }
        }
        threadsWithCustomRead.forEach(id => {
          unreadMap[id] = counts[id] || 0;
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
    // Include the message id so the client can scroll to + highlight the
    // specific message (ChannelView reads `?msg=` on mount). Without it, the
    // user lands on the channel but has to hunt for the message that was
    // notified about — which defeats the point of the notification.
    const pushUrl = `/workspace/${channel.workspaceId}?channel=${req.params.channelId}&msg=${message.id}`;
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

      // Store mentions for activity feed
      const mentionUserIds = mentionedUsers
        .filter(m => m.userId !== req.user.id)
        .map(m => m.userId);
      if (mentionUserIds.length > 0) {
        prisma.mention.createMany({
          data: mentionUserIds.map(userId => ({ userId, messageId: message.id })),
          skipDuplicates: true,
        }).catch(() => {}); // Non-critical, don't block message send
      }

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

      // Thread-reply notifications need to deep-link into the thread view,
      // not just the channel. Without &thread=<parentId>, tapping the
      // notification lands the user in the channel and they can't see the
      // reply (which lives nested in a thread, not in the channel's
      // top-level messages). The reply's `msg` is preserved for highlight
      // within the thread view.
      const threadPushUrl = `${pushUrl}&thread=${parentId}`;
      for (const userId of participantIds) {
        if (notifiedUserIds.has(userId) || mutedParticipants.has(userId)) continue;
        notifiedUserIds.add(userId);
        sendPushToUser(userId, {
          title: `Thread reply in #${channel.name}`,
          body: `${req.user.displayName}: ${pushBody}`,
          tag: `thread-${parentId}`,
          url: threadPushUrl,
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
        // Only notify users who are actually members of this channel (prevents private channel leak)
        const optedInIds = optedInMembers.map(m => m.userId);
        const channelMembers = await prisma.channelMember.findMany({
          where: { channelId: req.params.channelId, userId: { in: optedInIds } },
          select: { userId: true, muted: true }
        });
        const mutedSet = new Set(channelMembers.filter(m => m.muted).map(m => m.userId));
        const memberSet = new Set(channelMembers.map(m => m.userId));
        optedInMembers.filter(m => memberSet.has(m.userId) && !mutedSet.has(m.userId)).forEach(m => {
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

    // Fan out badge:update to every unmuted channel member whose unread count
    // changed. Runs AFTER the response is sent so the client isn't blocked by
    // N parallel COUNT queries in large channels.
    //
    // We fire-and-forget via setImmediate; emit errors are swallowed. The push
    // payload also carries a badge value as a fallback for devices without an
    // active socket, so even if this silently fails the badge converges.
    if (!parentId) {
      setImmediate(async () => {
        try {
          const allMembers = await prisma.channelMember.findMany({
            where: {
              channelId: req.params.channelId,
              muted: false,
              userId: { not: req.user.id },
            },
            select: { userId: true },
          });
          for (const m of allMembers) {
            emitBadgeUpdate(io, m.userId);
          }
        } catch (e) {
          console.warn('Failed to emit badge updates after message create:', e.message);
        }
      });
    }
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
      select: { url: true, thumbnailUrl: true, size: true },
    });
    let freedBytes = 0;
    for (const att of attachments) {
      // The generated thumbnail is a separate R2 object; deleting only the
      // original leaks it permanently. Its bytes were never added to the
      // workspace counter, so freedBytes stays based on the original alone.
      for (const url of [att.url, att.thumbnailUrl]) {
        if (url && isR2Url(url)) {
          try { await deleteFile(url); } catch { /* best effort */ }
        }
      }
      freedBytes += att.size || 0;
    }
    if (freedBytes > 0) {
      await safeDecrementStorage(message.channel.workspaceId, freedBytes).catch(() => {});
    }

    // Capture which channel members had this message unread BEFORE deleting, so
    // we can refresh their badges after. Only matters for top-level messages.
    let membersWithUnread = [];
    if (!message.parentId) {
      try {
        membersWithUnread = await prisma.channelMember.findMany({
          where: {
            channelId: message.channelId,
            muted: false,
            userId: { not: message.authorId },
            lastRead: { lt: message.createdAt },
          },
          select: { userId: true },
        });
      } catch { /* best effort */ }
    }

    await prisma.message.delete({
      where: { id: req.params.messageId }
    });

    // Broadcast deletion via socket
    const io = req.app.get('io');
    io.to(`channel:${message.channelId}`).emit('message:deleted', {
      messageId: req.params.messageId,
      channelId: message.channelId,
      parentId: message.parentId
    });

    // Refresh badges for anyone who had this as unread — fire-and-forget
    // after the response so a large recipient list doesn't delay the client.
    if (membersWithUnread.length > 0) {
      setImmediate(() => {
        for (const m of membersWithUnread) {
          emitBadgeUpdate(io, m.userId);
        }
      });
    }

    logAudit('message.deleted', { actorId: req.user.id, targetId: req.params.messageId });

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

    // Fetch timeline messages (top-level + thread replies)
    const messages = await prisma.message.findMany({
      where: {
        channelId: { in: accessibleChannels.map(c => c.id) },
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
        _count: { select: { replies: true } },
        parent: {
          select: {
            id: true,
            content: true,
            author: { select: { id: true, displayName: true } }
          }
        }
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

// Get activity feed (reactions to your messages, mentions, thread replies)
router.get('/activity/:workspaceId', authenticate, searchLimiter, async (req, res) => {
  try {
    const { cursor, limit = 50 } = req.query;
    const take = Math.min(parseInt(limit) || 50, 100);
    const userId = req.user.id;

    // Verify membership
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: req.params.workspaceId } }
    });
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    // Get accessible channels
    const accessibleChannels = await prisma.channel.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        OR: [{ isPrivate: false }, { members: { some: { userId } } }]
      },
      select: { id: true }
    });
    const channelIds = accessibleChannels.map(c => c.id);
    if (channelIds.length === 0) return res.json({ items: [], nextCursor: null, hasMore: false });

    // Cutoff: only last 30 days of activity
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch 3 activity types in parallel
    const [reactions, mentions, threadReplies] = await Promise.all([
      // 1. Reactions to your messages
      prisma.reaction.findMany({
        where: {
          userId: { not: userId },
          message: { authorId: userId, channelId: { in: channelIds } },
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        take: take,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          message: {
            select: {
              id: true, content: true, channelId: true,
              channel: { select: { id: true, name: true, isDirect: true } }
            }
          }
        }
      }),
      // 2. Mentions of you
      prisma.mention.findMany({
        where: {
          userId,
          createdAt: { gt: since },
          message: { channelId: { in: channelIds }, authorId: { not: userId } }
        },
        orderBy: { createdAt: 'desc' },
        take: take,
        include: {
          message: {
            select: {
              id: true, content: true, channelId: true, createdAt: true,
              author: { select: { id: true, displayName: true, avatarUrl: true } },
              channel: { select: { id: true, name: true, isDirect: true } }
            }
          }
        }
      }),
      // 3. Thread replies to threads you participated in
      prisma.message.findMany({
        where: {
          channelId: { in: channelIds },
          authorId: { not: userId },
          createdAt: { gt: since },
          parentId: { not: null },
          parent: {
            OR: [
              { authorId: userId },
              { replies: { some: { authorId: userId } } }
            ]
          }
        },
        orderBy: { createdAt: 'desc' },
        take: take,
        select: {
          id: true, content: true, channelId: true, parentId: true, createdAt: true,
          author: { select: { id: true, displayName: true, avatarUrl: true } },
          channel: { select: { id: true, name: true, isDirect: true } },
          parent: { select: { id: true, content: true } }
        }
      })
    ]);

    // Merge and sort chronologically
    const items = [
      ...reactions.map(r => ({
        type: 'reaction',
        id: `r-${r.id}`,
        createdAt: r.createdAt,
        actor: r.user,
        emoji: r.emoji,
        message: r.message,
        channelId: r.message.channelId,
        channelName: r.message.channel?.name,
        isDirect: r.message.channel?.isDirect || false,
      })),
      ...mentions.map(m => ({
        type: 'mention',
        id: `m-${m.id}`,
        createdAt: m.message.createdAt,
        actor: m.message.author,
        message: { id: m.message.id, content: m.message.content },
        channelId: m.message.channelId,
        channelName: m.message.channel?.name,
        isDirect: m.message.channel?.isDirect || false,
      })),
      ...threadReplies.map(t => ({
        type: 'thread_reply',
        id: `t-${t.id}`,
        createdAt: t.createdAt,
        actor: t.author,
        message: { id: t.id, content: t.content },
        parentContent: t.parent?.content,
        parentId: t.parentId,
        channelId: t.channelId,
        channelName: t.channel?.name,
        isDirect: t.channel?.isDirect || false,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
     .slice(0, take);

    res.json({ items, hasMore: items.length >= take });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity' });
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

    // For private channels, also require channel membership. Without this,
    // any workspace member who can guess/discover a messageId can pin a
    // message in a private channel they don't belong to — and the upsert
    // response includes the full message body + attachments, leaking it.
    if (message.channel.isPrivate) {
      const channelMembership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId: req.user.id, channelId: message.channelId }
        }
      });
      if (!channelMembership) {
        return res.status(403).json({ error: 'Not a member of this private channel' });
      }
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

    logAudit('message.pinned', { actorId: req.user.id, targetId: req.params.messageId, metadata: { channelId: message.channelId } });

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

    // Private channels: also require channel membership (same as pin).
    if (message.channel.isPrivate) {
      const channelMembership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId: req.user.id, channelId: message.channelId }
        }
      });
      if (!channelMembership) {
        return res.status(403).json({ error: 'Not a member of this private channel' });
      }
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

    logAudit('message.unpinned', { actorId: req.user.id, targetId: req.params.messageId });

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

    // Private channels: require channel membership too. Without this, any
    // workspace member with a messageId could enumerate who in the private
    // channel has read it.
    if (message.channel.isPrivate) {
      const channelMembership = await prisma.channelMember.findUnique({
        where: {
          userId_channelId: { userId: req.user.id, channelId: message.channelId }
        }
      });
      if (!channelMembership) {
        return res.status(403).json({ error: 'Not a member of this private channel' });
      }
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
