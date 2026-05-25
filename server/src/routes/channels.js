import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin, isChannelMember } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import { forceLeaveRoom } from '../socket/handlers.js';
import { logAudit } from '../lib/audit.js';
import { emitBadgeUpdate } from '../lib/unreadCount.js';

const router = express.Router();

// Get channels for a workspace (excludes DMs)
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        isDirect: false,
        OR: [
          { isPrivate: false },
          {
            members: {
              some: { userId: req.user.id }
            }
          }
        ]
      },
      include: {
        _count: {
          select: { members: true, messages: true }
        },
        members: {
          where: { userId: req.user.id },
          select: { muted: true, starred: true, lastRead: true }
        },
        group: {
          select: {
            id: true,
            name: true
          }
        },
        pinnedSetlist: {
          select: {
            id: true,
            name: true,
            _count: { select: { songs: true } }
          }
        }
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }]
    });

    // Build per-channel metadata
    const channelMeta = new Map();
    channels.forEach(c => {
      const membership = c.members[0];
      channelMeta.set(c.id, {
        lastRead: membership?.lastRead || new Date(0),
        isMuted: membership?.muted || false,
        isStarred: membership?.starred || false
      });
    });

    const unmutedChannelIds = channels
      .filter(c => !channelMeta.get(c.id).isMuted)
      .map(c => c.id);

    // Batch: fetch all thread parents and thread reads in 2 queries (instead of N+N)
    const [allThreadParents, allThreadReads] = await Promise.all([
      unmutedChannelIds.length > 0
        ? prisma.message.findMany({
            where: {
              channelId: { in: unmutedChannelIds },
              parentId: null,
              replies: { some: {} }
            },
            select: { id: true, channelId: true }
          })
        : [],
      prisma.threadRead.findMany({
        where: {
          userId: req.user.id,
          message: { channel: { workspaceId: req.params.workspaceId } }
        }
      })
    ]);

    // Build lookup maps
    const threadParentsByChannel = new Map();
    allThreadParents.forEach(tp => {
      if (!threadParentsByChannel.has(tp.channelId)) {
        threadParentsByChannel.set(tp.channelId, []);
      }
      threadParentsByChannel.get(tp.channelId).push(tp.id);
    });
    const threadReadMap = Object.fromEntries(allThreadReads.map(tr => [tr.messageId, tr.lastRead]));

    // Batch unread counts: one query with groupBy instead of N per-channel queries
    // Build per-channel lastRead conditions for a single raw approach
    // We group unmuted channels by lastRead to minimize queries
    const lastReadGroups = new Map(); // lastRead ISO string → channelId[]
    for (const chId of unmutedChannelIds) {
      const lr = channelMeta.get(chId).lastRead.toISOString();
      if (!lastReadGroups.has(lr)) lastReadGroups.set(lr, []);
      lastReadGroups.get(lr).push(chId);
    }

    // Run one count query per unique lastRead value (typically far fewer than N channels)
    const unreadCountMap = new Map(); // channelId → count
    await Promise.all(
      [...lastReadGroups.entries()].map(async ([lastReadISO, chIds]) => {
        const counts = await prisma.message.groupBy({
          by: ['channelId'],
          where: {
            channelId: { in: chIds },
            parentId: null,
            createdAt: { gt: new Date(lastReadISO) },
            authorId: { not: req.user.id }
          },
          _count: true
        });
        for (const row of counts) {
          unreadCountMap.set(row.channelId, row._count);
        }
      })
    );

    // Batch thread reply counts similarly
    const allThreadParentIds = allThreadParents.map(tp => tp.id);
    const threadUnreadMap = new Map(); // channelId → total unread replies
    if (allThreadParentIds.length > 0) {
      // Build per-thread lastRead conditions
      const threadLastReadGroups = new Map(); // lastRead ISO → parentId[]
      for (const tp of allThreadParents) {
        const channelLastRead = channelMeta.get(tp.channelId).lastRead;
        const tlr = (threadReadMap[tp.id] || channelLastRead).toISOString();
        if (!threadLastReadGroups.has(tlr)) threadLastReadGroups.set(tlr, []);
        threadLastReadGroups.get(tlr).push(tp);
      }

      await Promise.all(
        [...threadLastReadGroups.entries()].map(async ([lastReadISO, tps]) => {
          const parentIds = tps.map(tp => tp.id);
          const counts = await prisma.message.groupBy({
            by: ['parentId'],
            where: {
              parentId: { in: parentIds },
              createdAt: { gt: new Date(lastReadISO) },
              authorId: { not: req.user.id }
            },
            _count: true
          });
          for (const row of counts) {
            // Find which channel this thread belongs to
            const tp = tps.find(t => t.id === row.parentId);
            if (tp) {
              threadUnreadMap.set(tp.channelId, (threadUnreadMap.get(tp.channelId) || 0) + row._count);
            }
          }
        })
      );
    }

    const channelsWithUnread = channels.map(channel => {
      const meta = channelMeta.get(channel.id);
      return {
        ...channel,
        groupId: channel.group?.id || null,
        muted: meta.isMuted,
        starred: meta.isStarred,
        unreadCount: meta.isMuted ? 0 : (unreadCountMap.get(channel.id) || 0),
        unreadThreadReplies: meta.isMuted ? 0 : (threadUnreadMap.get(channel.id) || 0),
        lastRead: meta.lastRead.toISOString(),
        members: undefined
      };
    });

    res.json(channelsWithUnread);
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

// Create channel
router.post('/workspace/:workspaceId', authenticate, apiLimiter, isWorkspaceMember, async (req, res) => {
  try {
    const { name, description, isPrivate, memberIds, groupId } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    // Input length validation
    if (name.length > 200) return res.status(400).json({ error: 'Channel name must be 200 characters or less' });
    if (description && description.length > 5000) return res.status(400).json({ error: 'Description must be 5,000 characters or less' });

    // Validate channel name (lowercase, no spaces)
    const channelName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (channelName.length === 0) {
      return res.status(400).json({ error: 'Invalid channel name' });
    }

    // Check if channel name already exists in workspace
    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId: req.params.workspaceId,
        name: channelName
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Channel name already exists' });
    }

    // Create channel with members
    let membersToAdd;
    if (isPrivate) {
      // Private channels: only creator + explicitly added members
      membersToAdd = [req.user.id];
      if (memberIds && Array.isArray(memberIds)) {
        const validMembers = await prisma.workspaceMember.findMany({
          where: {
            workspaceId: req.params.workspaceId,
            userId: { in: memberIds }
          }
        });
        membersToAdd.push(...validMembers.map(m => m.userId).filter(id => id !== req.user.id));
      }
    } else {
      // Public channels: add all workspace members
      const allMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: req.params.workspaceId },
        select: { userId: true }
      });
      membersToAdd = allMembers.map(m => m.userId);
    }

    const channel = await prisma.channel.create({
      data: {
        name: channelName,
        description,
        isPrivate: isPrivate || false,
        workspaceId: req.params.workspaceId,
        groupId: groupId || null,
        members: {
          create: membersToAdd.map(userId => ({ userId }))
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        group: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: { messages: true }
        }
      }
    });

    // Notify workspace members via socket
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('channel:created', channel);

    logAudit('channel.created', { actorId: req.user.id, targetId: channel.id, metadata: { name: channel.name, workspaceId: req.params.workspaceId } });

    res.status(201).json(channel);
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Get channel by ID
router.get('/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        _count: {
          select: { messages: true }
        }
      }
    });

    // Augment user avatars with BandMember imageUrl fallback
    if (channel?.members?.length) {
      const userIdsWithoutAvatar = channel.members
        .filter(m => m.user && !m.user.avatarUrl)
        .map(m => m.user.id);
      if (userIdsWithoutAvatar.length > 0) {
        const bandMembers = await prisma.bandMember.findMany({
          where: { workspaceId: channel.workspaceId, linkedUserId: { in: userIdsWithoutAvatar }, imageUrl: { not: null } },
          select: { linkedUserId: true, imageUrl: true }
        });
        const bandAvatarMap = new Map(bandMembers.map(bm => [bm.linkedUserId, bm.imageUrl]));
        for (const member of channel.members) {
          if (!member.user.avatarUrl && bandAvatarMap.has(member.user.id)) {
            member.user.avatarUrl = bandAvatarMap.get(member.user.id);
          }
        }
      }
    }

    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

// Update channel
router.put('/:channelId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Fetch the channel to get createdById and workspaceId
    const existingChannel = await prisma.channel.findUnique({
      where: { id: req.params.channelId }
    });

    if (!existingChannel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is workspace admin or channel creator
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: existingChannel.workspaceId
        }
      }
    });

    if (!membership || (membership.role !== 'ADMIN' && req.user.id !== existingChannel.createdById)) {
      return res.status(403).json({ error: 'Only admins or the channel creator can update this channel' });
    }

    // Input length validation
    if (name && name.length > 200) return res.status(400).json({ error: 'Channel name must be 200 characters or less' });
    if (description && description.length > 5000) return res.status(400).json({ error: 'Description must be 5,000 characters or less' });

    // Validate channel name if provided
    let sanitizedName;
    if (name) {
      sanitizedName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!sanitizedName) {
        return res.status(400).json({ error: 'Channel name must contain at least one alphanumeric character' });
      }
    }

    const channel = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: {
        ...(sanitizedName && { name: sanitizedName }),
        ...(description !== undefined && { description })
      }
    });

    // Notify channel members
    const io = req.app.get('io');
    io.to(`channel:${req.params.channelId}`).emit('channel:updated', channel);

    res.json(channel);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Channel name already exists' });
    }
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// Delete channel
router.delete('/:channelId', authenticate, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is workspace admin
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: channel.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Can't delete the general channel
    if (channel.name === 'general') {
      return res.status(400).json({ error: 'Cannot delete the general channel' });
    }

    await prisma.channel.delete({
      where: { id: req.params.channelId }
    });

    // Notify workspace members
    const io = req.app.get('io');
    io.to(`workspace:${channel.workspaceId}`).emit('channel:deleted', {
      channelId: req.params.channelId
    });

    logAudit('channel.deleted', { actorId: req.user.id, targetId: req.params.channelId, metadata: { name: channel.name } });

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Add member to channel
router.post('/:channelId/members', authenticate, isChannelMember, async (req, res) => {
  try {
    const { userId } = req.body;
    const channel = req.channel;

    // For private channels, restrict member-adding to workspace admins.
    // Without this, any private-channel member could add anyone else in the
    // workspace, defeating the whole point of `isPrivate`. Public channels
    // stay open — any member can invite, since anyone in the workspace can
    // join one on their own anyway. (The Channel model has no creator or
    // per-channel role field, so workspace admin is the available bar.)
    if (channel.isPrivate) {
      const callerMembership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.user.id,
            workspaceId: channel.workspaceId
          }
        }
      });
      if (callerMembership?.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Only workspace admins can add members to a private channel'
        });
      }
    }

    // Verify user is in the workspace
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: channel.workspaceId
        }
      }
    });

    if (!workspaceMember) {
      return res.status(400).json({ error: 'User is not in this workspace' });
    }

    const member = await prisma.channelMember.create({
      data: {
        userId,
        channelId: req.params.channelId
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });

    // Notify channel
    const io = req.app.get('io');
    io.to(`channel:${req.params.channelId}`).emit('channel:member:added', {
      channelId: req.params.channelId,
      member
    });

    res.status(201).json(member);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a member' });
    }
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from channel
router.delete('/:channelId/members/:userId', authenticate, isChannelMember, async (req, res) => {
  try {
    const { channelId, userId } = req.params;

    // Allow self-removal; for removing others, require workspace admin role
    if (userId !== req.user.id) {
      const channel = req.channel;
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.user.id,
            workspaceId: channel.workspaceId
          }
        }
      });

      if (!membership || membership.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can remove other members from a channel' });
      }
    }

    await prisma.channelMember.delete({
      where: {
        userId_channelId: { userId, channelId }
      }
    });

    // M9: Force-evict the removed user from the channel socket room
    const io = req.app.get('io');
    await forceLeaveRoom(io, userId, `channel:${channelId}`);

    // Notify channel
    io.to(`channel:${channelId}`).emit('channel:member:removed', {
      channelId,
      userId
    });

    logAudit('channel.member_removed', { actorId: req.user.id, targetId: userId, metadata: { channelId } });

    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Mute/unmute channel
router.put('/:channelId/mute', authenticate, isChannelMember, async (req, res) => {
  try {
    const { muted } = req.body;

    await prisma.channelMember.update({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: req.params.channelId
        }
      },
      data: { muted }
    });

    // Badge count changes when a channel with unreads is muted/unmuted
    emitBadgeUpdate(req.app.get('io'), req.user.id);

    res.json({ muted });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mute setting' });
  }
});

// Star/unstar channel
router.put('/:channelId/star', authenticate, isChannelMember, async (req, res) => {
  try {
    const { starred } = req.body;

    await prisma.channelMember.update({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: req.params.channelId
        }
      },
      data: { starred: !!starred }
    });

    res.json({ starred: !!starred });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update star setting' });
  }
});

// Mark channel as read
router.post('/:channelId/read', authenticate, isChannelMember, async (req, res) => {
  try {
    await prisma.channelMember.upsert({
      where: {
        userId_channelId: {
          userId: req.user.id,
          channelId: req.params.channelId
        }
      },
      update: { lastRead: new Date() },
      create: {
        userId: req.user.id,
        channelId: req.params.channelId,
        lastRead: new Date()
      }
    });

    // Emit badge update to user's devices (iOS HIG: badge must update immediately on read)
    const io = req.app.get('io');
    emitBadgeUpdate(io, req.user.id);
    // Also emit a per-channel read event so any other devices (e.g. mobile while
    // reading on web) can clear that channel's in-app sidebar unread count live.
    io.to(`user:${req.user.id}`).emit('channel:read', { channelId: req.params.channelId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Get DMs for a workspace
router.get('/workspace/:workspaceId/dms', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Get current workspace members
    const currentMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true }
    });
    const currentMemberIds = new Set(currentMembers.map(m => m.userId));

    const dms = await prisma.channel.findMany({
      where: {
        workspaceId,
        isDirect: true,
        members: {
          some: { userId: req.user.id }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            createdAt: true
          }
        },
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Batch: fetch all DM thread parents and thread reads in 2 queries (instead of N+N)
    const dmIds = dms.map(dm => dm.id);
    const [allDmThreadParents, allDmThreadReads] = await Promise.all([
      dmIds.length > 0
        ? prisma.message.findMany({
            where: {
              channelId: { in: dmIds },
              parentId: null,
              replies: { some: {} }
            },
            select: { id: true, channelId: true }
          })
        : [],
      prisma.threadRead.findMany({
        where: {
          userId: req.user.id,
          message: { channel: { workspaceId: req.params.workspaceId } }
        }
      })
    ]);

    // Build lookup maps
    const dmThreadParentsByChannel = new Map();
    allDmThreadParents.forEach(tp => {
      if (!dmThreadParentsByChannel.has(tp.channelId)) {
        dmThreadParentsByChannel.set(tp.channelId, []);
      }
      dmThreadParentsByChannel.get(tp.channelId).push(tp.id);
    });
    const dmThreadReadMap = Object.fromEntries(allDmThreadReads.map(tr => [tr.messageId, tr.lastRead]));

    // Build per-DM metadata
    const dmMeta = new Map();
    dms.forEach(dm => {
      const userMembership = dm.members.find(m => m.user.id === req.user.id);
      dmMeta.set(dm.id, {
        lastRead: userMembership?.lastRead || new Date(0),
        isMuted: userMembership?.muted || false
      });
    });

    const unmutedDmIds = dms
      .filter(dm => !dmMeta.get(dm.id).isMuted)
      .map(dm => dm.id);

    // Batch unread counts: group DMs by lastRead to minimize queries
    const dmLastReadGroups = new Map();
    for (const dmId of unmutedDmIds) {
      const lr = dmMeta.get(dmId).lastRead.toISOString();
      if (!dmLastReadGroups.has(lr)) dmLastReadGroups.set(lr, []);
      dmLastReadGroups.get(lr).push(dmId);
    }

    const dmUnreadCountMap = new Map();
    await Promise.all(
      [...dmLastReadGroups.entries()].map(async ([lastReadISO, dmIds]) => {
        const counts = await prisma.message.groupBy({
          by: ['channelId'],
          where: {
            channelId: { in: dmIds },
            parentId: null,
            createdAt: { gt: new Date(lastReadISO) },
            authorId: { not: req.user.id }
          },
          _count: true
        });
        for (const row of counts) {
          dmUnreadCountMap.set(row.channelId, row._count);
        }
      })
    );

    // Batch thread reply counts
    const dmThreadUnreadMap = new Map();
    const allDmThreadParentIds = allDmThreadParents.map(tp => tp.id);
    if (allDmThreadParentIds.length > 0) {
      const dmThreadLastReadGroups = new Map();
      for (const tp of allDmThreadParents) {
        const channelLastRead = dmMeta.get(tp.channelId).lastRead;
        const tlr = (dmThreadReadMap[tp.id] || channelLastRead).toISOString();
        if (!dmThreadLastReadGroups.has(tlr)) dmThreadLastReadGroups.set(tlr, []);
        dmThreadLastReadGroups.get(tlr).push(tp);
      }

      await Promise.all(
        [...dmThreadLastReadGroups.entries()].map(async ([lastReadISO, tps]) => {
          const parentIds = tps.map(tp => tp.id);
          const counts = await prisma.message.groupBy({
            by: ['parentId'],
            where: {
              parentId: { in: parentIds },
              createdAt: { gt: new Date(lastReadISO) },
              authorId: { not: req.user.id }
            },
            _count: true
          });
          for (const row of counts) {
            const tp = tps.find(t => t.id === row.parentId);
            if (tp) {
              dmThreadUnreadMap.set(tp.channelId, (dmThreadUnreadMap.get(tp.channelId) || 0) + row._count);
            }
          }
        })
      );
    }

    // Assemble results synchronously from Maps
    const dmsWithUnread = dms.map(dm => {
      const meta = dmMeta.get(dm.id);
      const otherMembers = dm.members
        .filter(m => m.user.id !== req.user.id)
        .filter(m => currentMemberIds.has(m.user.id));

      return {
        ...dm,
        otherMembers: otherMembers.map(m => m.user),
        lastMessage: dm.messages[0] || null,
        unreadCount: meta.isMuted ? 0 : (dmUnreadCountMap.get(dm.id) || 0),
        unreadThreadReplies: meta.isMuted ? 0 : (dmThreadUnreadMap.get(dm.id) || 0),
        messages: undefined
      };
    });

    // Filter out DMs where there are no valid other members (they all left)
    const validDms = dmsWithUnread.filter(dm => dm.otherMembers.length > 0);

    res.json(validDms);
  } catch (error) {
    console.error('Get DMs error:', error);
    res.status(500).json({ error: 'Failed to get DMs' });
  }
});

// Create or get existing DM
router.post('/workspace/:workspaceId/dm', authenticate, apiLimiter, isWorkspaceMember, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    // Include the current user
    const allUserIds = [...new Set([req.user.id, ...userIds])].sort();

    // Verify all users are in the workspace
    const validMembers = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        userId: { in: allUserIds }
      }
    });

    if (validMembers.length !== allUserIds.length) {
      return res.status(400).json({ error: 'One or more users are not in this workspace' });
    }

    // Generate a unique name for the DM based on sorted user IDs
    const dmName = `dm-${allUserIds.join('-')}`;

    // Check if DM already exists
    let dm = await prisma.channel.findFirst({
      where: {
        workspaceId: req.params.workspaceId,
        isDirect: true,
        name: dmName
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    if (!dm) {
      try {
        // Create new DM
        dm = await prisma.channel.create({
          data: {
            name: dmName,
            isDirect: true,
            isPrivate: true,
            workspaceId: req.params.workspaceId,
            members: {
              create: allUserIds.map(userId => ({ userId }))
            }
          },
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          }
        });

        // Notify all members about the new DM
        const io = req.app.get('io');
        allUserIds.forEach(userId => {
          io.to(`user:${userId}`).emit('dm:created', dm);
        });
      } catch (createError) {
        // Handle race condition: another request already created this DM
        if (createError.code === 'P2002') {
          dm = await prisma.channel.findFirst({
            where: {
              workspaceId: req.params.workspaceId,
              isDirect: true,
              name: dmName
            },
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      displayName: true,
                      avatarUrl: true
                    }
                  }
                }
              }
            }
          });
        } else {
          throw createError;
        }
      }
    }

    // Get other members for display
    const otherMembers = dm.members.filter(m => m.user.id !== req.user.id);

    res.json({
      ...dm,
      otherMembers: otherMembers.map(m => m.user)
    });
  } catch (error) {
    console.error('Create DM error:', error);
    res.status(500).json({ error: 'Failed to create DM' });
  }
});

// Pin a setlist to a channel
router.post('/:channelId/pin-setlist', authenticate, async (req, res) => {
  try {
    const { setlistId } = req.body;
    if (!setlistId || typeof setlistId !== 'string' || setlistId.length > 100) {
      return res.status(400).json({ error: 'Valid setlistId is required' });
    }

    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.isDirect) {
      return res.status(400).json({ error: 'Cannot pin setlists to direct messages' });
    }

    // Check workspace membership and require admin role
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: channel.workspaceId } }
    });
    if (!membership) return res.status(403).json({ error: 'Not a workspace member' });
    if (membership.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can pin setlists to channels' });

    // For private channels, verify the user is a member
    if (channel.isPrivate) {
      const channelMember = await prisma.channelMember.findUnique({
        where: { userId_channelId: { userId: req.user.id, channelId: channel.id } }
      });
      if (!channelMember) return res.status(403).json({ error: 'Not a member of this channel' });
    }

    // Verify setlist belongs to the same workspace
    const setlist = await prisma.setlist.findUnique({ where: { id: setlistId } });
    if (!setlist || setlist.workspaceId !== channel.workspaceId) {
      return res.status(400).json({ error: 'Setlist not found in this workspace' });
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: { pinnedSetlistId: setlistId },
      include: {
        pinnedSetlist: {
          include: { songs: { include: { song: true }, orderBy: { position: 'asc' } } }
        }
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channel.id}`).emit('channel:updated', { id: channel.id, pinnedSetlistId: setlistId, pinnedSetlist: updated.pinnedSetlist });
    }

    res.json({ pinnedSetlist: updated.pinnedSetlist });
  } catch (error) {
    console.error('Pin setlist error:', error);
    res.status(500).json({ error: 'Failed to pin setlist' });
  }
});

// Unpin setlist from a channel
router.delete('/:channelId/pin-setlist', authenticate, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: channel.workspaceId } }
    });
    if (!membership) return res.status(403).json({ error: 'Not a workspace member' });
    if (membership.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can unpin setlists' });

    await prisma.channel.update({
      where: { id: req.params.channelId },
      data: { pinnedSetlistId: null }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channel.id}`).emit('channel:updated', { id: channel.id, pinnedSetlistId: null, pinnedSetlist: null });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Unpin setlist error:', error);
    res.status(500).json({ error: 'Failed to unpin setlist' });
  }
});

export default router;
