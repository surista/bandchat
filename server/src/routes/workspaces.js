import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Generate a random invite code
const generateInviteCode = () => {
  return uuidv4().split('-')[0].toUpperCase();
};

// Get expiration date based on duration (in hours, null = never expires)
const getInviteExpiration = (hours = 24) => {
  if (hours === null || hours === 0) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

// Get all workspaces for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const workspaces = await prisma.workspaceMember.findMany({
      where: { userId: req.user.id },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true, channels: true }
            }
          }
        }
      }
    });

    res.json(workspaces.map(wm => ({
      ...wm.workspace,
      role: wm.role,
      joinedAt: wm.joinedAt
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get workspaces' });
  }
});

// Create a new workspace
router.post('/', authenticate, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        inviteCode: generateInviteCode(),
        inviteCodeExpiresAt: getInviteExpiration(),
        members: {
          create: {
            userId: req.user.id,
            role: 'ADMIN'
          }
        },
        channels: {
          create: {
            name: 'general',
            description: 'General discussions',
            members: {
              create: {
                userId: req.user.id
              }
            }
          }
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
        channels: true
      }
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Get workspace by ID
router.get('/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        channels: {
          where: {
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
              select: { messages: true }
            }
          }
        }
      }
    });

    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

// Update workspace
router.put('/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    const workspace = await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: {
        ...(name && { name: name.trim() })
      }
    });

    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// Delete workspace
router.delete('/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    await prisma.workspace.delete({
      where: { id: req.params.workspaceId }
    });

    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// Join workspace via invite code
router.post('/join/:inviteCode', authenticate, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { inviteCode: req.params.inviteCode.toUpperCase() }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    // Check if invite code has expired
    if (workspace.inviteCodeExpiresAt && new Date() > workspace.inviteCodeExpiresAt) {
      return res.status(400).json({ error: 'Invite code has expired' });
    }

    // Check if invite has reached max uses
    if (workspace.inviteMaxUses !== null && workspace.inviteUsedCount >= workspace.inviteMaxUses) {
      return res.status(400).json({ error: 'Invite link has reached its usage limit' });
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: workspace.id
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: 'Already a member of this workspace' });
    }

    // Add user to workspace and all public channels
    const publicChannels = await prisma.channel.findMany({
      where: {
        workspaceId: workspace.id,
        isPrivate: false
      }
    });

    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          userId: req.user.id,
          workspaceId: workspace.id
        }
      }),
      // Increment the invite used count
      prisma.workspace.update({
        where: { id: workspace.id },
        data: { inviteUsedCount: { increment: 1 } }
      }),
      ...publicChannels.map(channel =>
        prisma.channelMember.create({
          data: {
            userId: req.user.id,
            channelId: channel.id
          }
        })
      )
    ]);

    const updatedWorkspace = await prisma.workspace.findUnique({
      where: { id: workspace.id },
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
        channels: {
          where: { isPrivate: false }
        }
      }
    });

    // Notify other members via socket
    const io = req.app.get('io');
    io.to(`workspace:${workspace.id}`).emit('member:joined', {
      workspaceId: workspace.id,
      user: req.user
    });

    res.json(updatedWorkspace);
  } catch (error) {
    console.error('Join workspace error:', error);
    res.status(500).json({ error: 'Failed to join workspace' });
  }
});

// Regenerate invite code with optional expiration and max uses
router.post('/:workspaceId/invite-code', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { expiresInHours, maxUses } = req.body;

    // expiresInHours: number of hours until expiration (null = never)
    // maxUses: max number of uses (null = unlimited)

    const workspace = await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: {
        inviteCode: generateInviteCode(),
        inviteCodeExpiresAt: getInviteExpiration(expiresInHours !== undefined ? expiresInHours : 24),
        inviteMaxUses: maxUses !== undefined ? maxUses : null,
        inviteUsedCount: 0 // Reset used count when regenerating
      }
    });

    res.json({
      inviteCode: workspace.inviteCode,
      expiresAt: workspace.inviteCodeExpiresAt,
      maxUses: workspace.inviteMaxUses,
      usedCount: workspace.inviteUsedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

// Get current invite code info
router.get('/:workspaceId/invite-code', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: {
        inviteCode: true,
        inviteCodeExpiresAt: true,
        inviteMaxUses: true,
        inviteUsedCount: true
      }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({
      inviteCode: workspace.inviteCode,
      expiresAt: workspace.inviteCodeExpiresAt,
      maxUses: workspace.inviteMaxUses,
      usedCount: workspace.inviteUsedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get invite code info' });
  }
});

// Send email invite
router.post('/:workspaceId/invite-email', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if invite code is valid
    if (workspace.inviteCodeExpiresAt && new Date() > workspace.inviteCodeExpiresAt) {
      return res.status(400).json({ error: 'Invite code has expired. Please generate a new one.' });
    }

    if (workspace.inviteMaxUses !== null && workspace.inviteUsedCount >= workspace.inviteMaxUses) {
      return res.status(400).json({ error: 'Invite has reached max uses. Please generate a new one.' });
    }

    const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/join/${workspace.inviteCode}`;

    if (!resend) {
      console.log(`[DEV] Would send invite email to ${email} for workspace ${workspace.name}`);
      console.log(`[DEV] Invite URL: ${inviteUrl}`);
      return res.json({ message: 'Invite email sent (dev mode)' });
    }

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'BandChat <noreply@bandchat.app>',
      to: email.trim(),
      subject: `You're invited to join ${workspace.name} on BandChat`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">You're invited!</h1>
          <p><strong>${req.user.displayName}</strong> has invited you to join <strong>${workspace.name}</strong> on BandChat.</p>
          <p>BandChat is a collaboration platform built for bands and musicians.</p>
          <div style="margin: 30px 0;">
            <a href="${inviteUrl}"
               style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Join ${workspace.name}
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <a href="${inviteUrl}">${inviteUrl}</a>
          </p>
          ${workspace.inviteCodeExpiresAt ? `<p style="color: #999; font-size: 12px;">This invite expires on ${new Date(workspace.inviteCodeExpiresAt).toLocaleDateString()}.</p>` : ''}
        </div>
      `
    });

    res.json({ message: 'Invite email sent' });
  } catch (error) {
    console.error('Send invite email error:', error);
    res.status(500).json({ error: 'Failed to send invite email' });
  }
});


// Update member role
router.put('/:workspaceId/members/:userId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Can't demote yourself if you're the only admin
    if (userId === req.user.id && role === 'MEMBER') {
      const adminCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' }
      });

      if (adminCount === 1) {
        return res.status(400).json({ error: 'Cannot demote the only admin' });
      }
    }

    const member = await prisma.workspaceMember.update({
      where: {
        userId_workspaceId: { userId, workspaceId }
      },
      data: { role },
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

    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Admin reset password for member
router.post('/:workspaceId/members/:userId/reset-password', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { newPassword, adminPassword } = req.body;

    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin password is required for verification' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify admin's password before allowing reset
    const admin = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const isValidPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Verify user is a member of this workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this workspace' });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Remove member from workspace with post handling options
router.delete('/:workspaceId/members/:userId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { postAction, mergeUserId } = req.query;
    // postAction: 'keep' | 'hide' | 'delete' | 'anonymize' | 'merge'

    // Can't remove yourself if you're the only admin
    if (userId === req.user.id) {
      const adminCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' }
      });

      if (adminCount === 1) {
        return res.status(400).json({ error: 'Cannot remove the only admin' });
      }
    }

    // Verify user is a member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } }
    });

    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this workspace' });
    }

    // Get all channel IDs in this workspace
    const channels = await prisma.channel.findMany({
      where: { workspaceId },
      select: { id: true }
    });
    const channelIds = channels.map(c => c.id);

    // Handle posts based on action
    if (postAction === 'delete') {
      // Delete all messages by this user in workspace channels
      await prisma.message.deleteMany({
        where: {
          authorId: userId,
          channelId: { in: channelIds }
        }
      });
    } else if (postAction === 'hide') {
      // Mark messages as hidden
      await prisma.message.updateMany({
        where: {
          authorId: userId,
          channelId: { in: channelIds }
        },
        data: { isHidden: true }
      });
    } else if (postAction === 'anonymize') {
      // Set a display name for removed user
      const removedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      await prisma.message.updateMany({
        where: {
          authorId: userId,
          channelId: { in: channelIds }
        },
        data: { removedUserName: `Removed User ${removedId}` }
      });
    } else if (postAction === 'merge' && mergeUserId) {
      // Transfer all messages to another user
      await prisma.message.updateMany({
        where: {
          authorId: userId,
          channelId: { in: channelIds }
        },
        data: { authorId: mergeUserId }
      });
    }
    // 'keep' - do nothing with posts

    // Remove from workspace
    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId, workspaceId } }
    });

    // Notify via socket
    const io = req.app.get('io');
    io.to(`workspace:${workspaceId}`).emit('member:removed', {
      workspaceId,
      userId
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get member profile with achievements
router.get('/:workspaceId/members/:userId/profile', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    // Verify the user is a member of this workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            email: true,
            createdAt: true
          }
        }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get their achievements in this workspace
    const achievements = await prisma.memberAchievement.findMany({
      where: {
        userId,
        workspaceId
      },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });

    // Get some stats
    const messageCount = await prisma.message.count({
      where: {
        authorId: userId,
        channel: { workspaceId }
      }
    });

    const songsAdded = await prisma.song.count({
      where: {
        workspaceId,
        createdById: userId
      }
    });

    const setlistsCreated = await prisma.setlist.count({
      where: {
        workspaceId,
        createdById: userId
      }
    });

    // Find band members linked to this user to count attendance
    // First try explicit linkedUserId, then fall back to name matching
    let linkedBandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: userId },
      select: { id: true }
    });

    // DEBUG: Log what we found
    console.log('Profile lookup for user:', userId, 'in workspace:', workspaceId);
    console.log('Found linked band members:', linkedBandMembers);

    const linkedBandMemberIds = linkedBandMembers.map(bm => bm.id);

    // Count gigs attended (via GigAttendee OR SetlistPerformer on a gig's setlist)
    let gigsAttended = 0;
    let rehearsalsAttended = 0;

    if (linkedBandMemberIds.length > 0) {
      // GIG ATTENDANCE = "Who Played" in Gig Archive (SetlistPerformer table)
      // This is set via the Gig Archive "Who Played This Gig?" dialog
      gigsAttended = await prisma.setlistPerformer.count({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          setlist: {
            // Setlist must be attached to a gig
            OR: [
              { gigs: { some: { workspaceId } } },           // Legacy single setlist
              { gigSetlists: { some: { gig: { workspaceId } } } }  // Multi-setlist
            ]
          }
        }
      });

      // REHEARSAL ATTENDANCE = Attendees in Calendar events (GigAttendee table)
      // Note: "GigAttendee" is used for ALL event types (gigs, rehearsals, etc.)
      // This is set via the Calendar event form "Attending" section
      rehearsalsAttended = await prisma.gigAttendee.count({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          gig: { workspaceId, type: 'REHEARSAL' }
        }
      });
    }

    res.json({
      user: membership.user,
      role: membership.role,
      joinedAt: membership.joinedAt,
      achievements: achievements.map(a => ({
        ...a.achievement,
        earnedAt: a.earnedAt
      })),
      stats: {
        messages: messageCount,
        songsAdded,
        setlistsCreated,
        gigsAttended,
        rehearsalsAttended
      }
    });
  } catch (error) {
    console.error('Get member profile error:', error);
    res.status(500).json({ error: 'Failed to get member profile' });
  }
});

// Get member's attended events (gigs or rehearsals)
router.get('/:workspaceId/members/:userId/events', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { type } = req.query; // 'GIG' or 'REHEARSAL'

    // Find band members linked to this user via linkedUserId
    // Note: linkedUserId is the ONLY way to link band members to users
    const linkedBandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: userId },
      select: { id: true }
    });

    const linkedBandMemberIds = linkedBandMembers.map(bm => bm.id);

    if (linkedBandMemberIds.length === 0) {
      return res.json([]);
    }

    let events = [];

    if (type === 'GIG') {
      // GIG ATTENDANCE = "Who Played" in Gig Archive (SetlistPerformer table)
      // This is set via the Gig Archive "Who Played This Gig?" dialog
      // We find gigs through their setlists where the band member performed
      const setlistPerformers = await prisma.setlistPerformer.findMany({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          setlist: {
            OR: [
              { gigs: { some: { workspaceId } } },           // Legacy single setlist
              { gigSetlists: { some: { gig: { workspaceId } } } }  // Multi-setlist
            ]
          }
        },
        select: {
          setlist: {
            select: {
              gigs: {
                where: { workspaceId },
                select: { id: true, title: true, date: true, venue: true, type: true }
              },
              gigSetlists: {
                where: { gig: { workspaceId } },
                select: {
                  gig: {
                    select: { id: true, title: true, date: true, venue: true, type: true }
                  }
                }
              }
            }
          }
        }
      });

      // Extract unique gigs from setlist performers
      const gigMap = new Map();
      for (const sp of setlistPerformers) {
        // Legacy single setlist relation
        for (const gig of sp.setlist.gigs || []) {
          if (!gigMap.has(gig.id)) {
            gigMap.set(gig.id, gig);
          }
        }
        // Multi-setlist relation
        for (const gs of sp.setlist.gigSetlists || []) {
          if (!gigMap.has(gs.gig.id)) {
            gigMap.set(gs.gig.id, gs.gig);
          }
        }
      }
      events = Array.from(gigMap.values());

    } else if (type === 'REHEARSAL') {
      // REHEARSAL ATTENDANCE = Attendees in Calendar events (GigAttendee table)
      // Note: "GigAttendee" is confusingly named - it's used for ALL event types
      // This is set via the Calendar event form "Attending" section
      events = await prisma.gig.findMany({
        where: {
          workspaceId,
          type: 'REHEARSAL',
          attendees: {
            some: { bandMemberId: { in: linkedBandMemberIds } }
          }
        },
        select: {
          id: true,
          title: true,
          date: true,
          venue: true,
          type: true
        },
        orderBy: { date: 'desc' }
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(events);
  } catch (error) {
    console.error('Get member events error:', error);
    res.status(500).json({ error: 'Failed to get member events' });
  }
});

export default router;
