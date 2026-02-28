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
    const { role, displayName, email } = req.body;

    // Handle role update
    if (role) {
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

      await prisma.workspaceMember.update({
        where: {
          userId_workspaceId: { userId, workspaceId }
        },
        data: { role }
      });
    }

    // Handle profile updates (displayName, email)
    if (displayName !== undefined || email !== undefined) {
      const userData = {};

      if (displayName !== undefined) {
        const trimmed = displayName.trim();
        if (trimmed.length < 2) {
          return res.status(400).json({ error: 'Display name must be at least 2 characters' });
        }
        if (trimmed.length > 50) {
          return res.status(400).json({ error: 'Display name must be 50 characters or less' });
        }
        const dangerousPattern = /[<>'"&\\\/\x00-\x1f]/;
        if (dangerousPattern.test(trimmed)) {
          return res.status(400).json({ error: 'Display name contains invalid characters' });
        }
        userData.displayName = trimmed;
      }

      if (email !== undefined) {
        const trimmedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return res.status(400).json({ error: 'Invalid email address' });
        }
        // Check uniqueness
        const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
        if (existing && existing.id !== userId) {
          return res.status(400).json({ error: 'Email already in use' });
        }
        userData.email = trimmedEmail;
      }

      await prisma.user.update({
        where: { id: userId },
        data: userData
      });
    }

    // Re-fetch updated member
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      },
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
    });

    res.json(member);
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
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

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify admin's password before allowing reset
    const admin = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!admin.password) {
      return res.status(400).json({ error: 'Admin account uses Google Sign-In only. Please set a password first.' });
    }

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
      // Validate mergeUserId is a member of this workspace
      const mergeTarget = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: mergeUserId, workspaceId } }
      });
      if (!mergeTarget) {
        return res.status(400).json({ error: 'Merge target user is not a member of this workspace' });
      }
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

    // Get their member achievements in this workspace
    const memberAchievements = await prisma.memberAchievement.findMany({
      where: {
        userId,
        workspaceId
      },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });

    // Also get band achievements (shared by all members)
    const bandAchievements = await prisma.bandAchievement.findMany({
      where: { workspaceId },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });

    // Combine both types of achievements
    const achievements = [
      ...memberAchievements.map(a => ({ ...a.achievement, earnedAt: a.earnedAt, type: 'member' })),
      ...bandAchievements.map(a => ({ ...a.achievement, earnedAt: a.earnedAt, type: 'band' }))
    ].sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

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

    // Find band members linked to this user (with stints for join date)
    let linkedBandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: userId },
      include: {
        stints: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    const linkedBandMemberIds = linkedBandMembers.map(bm => bm.id);

    // Get band join date from earliest instrument stint
    let bandJoinDate = null;
    for (const bm of linkedBandMembers) {
      if (bm.stints && bm.stints.length > 0) {
        const earliestStint = bm.stints[0];
        if (!bandJoinDate || earliestStint.startDate < bandJoinDate) {
          bandJoinDate = earliestStint.startDate;
        }
      }
    }

    // Count gigs attended (via GigAttendee OR SetlistPerformer on a gig's setlist)
    let gigsAttended = 0;
    let rehearsalsAttended = 0;

    if (linkedBandMemberIds.length > 0) {
      // GIG ATTENDANCE = "Who Played" in Gig Archive (SetlistPerformer table)
      // This is set via the Gig Archive "Who Played This Gig?" dialog
      // We need to count UNIQUE gigs, not setlist performers (since multi-set gigs have multiple setlists)
      const setlistPerformers = await prisma.setlistPerformer.findMany({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          setlist: {
            OR: [
              { gigs: { some: { workspaceId } } },
              { gigSetlists: { some: { gig: { workspaceId } } } }
            ]
          }
        },
        select: {
          setlist: {
            select: {
              gigs: { where: { workspaceId }, select: { id: true } },
              gigSetlists: { where: { gig: { workspaceId } }, select: { gig: { select: { id: true } } } }
            }
          }
        }
      });

      // Extract unique gig IDs
      const gigIds = new Set();
      for (const sp of setlistPerformers) {
        for (const gig of sp.setlist.gigs || []) {
          gigIds.add(gig.id);
        }
        for (const gs of sp.setlist.gigSetlists || []) {
          gigIds.add(gs.gig.id);
        }
      }
      gigsAttended = gigIds.size;

      // REHEARSAL ATTENDANCE = Attendees in Calendar events (GigAttendee table)
      // Note: "GigAttendee" is used for ALL event types (gigs, rehearsals, etc.)
      // This is set via the Calendar event form "Attending" section
      // Only count past rehearsals (not future ones)
      rehearsalsAttended = await prisma.gigAttendee.count({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          gig: { workspaceId, type: 'REHEARSAL', date: { lt: new Date() } }
        }
      });
    }

    // Find first and last gig dates for this member
    let firstGigDate = null;
    let lastGigDate = null;
    if (linkedBandMemberIds.length > 0) {
      // Get all gig dates where this member performed
      const performances = await prisma.setlistPerformer.findMany({
        where: {
          bandMemberId: { in: linkedBandMemberIds },
          setlist: {
            OR: [
              { gigs: { some: { workspaceId, type: 'GIG' } } },
              { gigSetlists: { some: { gig: { workspaceId, type: 'GIG' } } } }
            ]
          }
        },
        select: {
          setlist: {
            select: {
              gigs: {
                where: { workspaceId, type: 'GIG' },
                select: { date: true }
              },
              gigSetlists: {
                where: { gig: { workspaceId, type: 'GIG' } },
                select: {
                  gig: { select: { date: true } }
                }
              }
            }
          }
        }
      });

      // Collect all gig dates
      const gigDates = [];
      for (const perf of performances) {
        for (const gig of perf.setlist.gigs || []) {
          if (gig.date) gigDates.push(new Date(gig.date));
        }
        for (const gs of perf.setlist.gigSetlists || []) {
          if (gs.gig?.date) gigDates.push(new Date(gs.gig.date));
        }
      }

      // Get min and max dates
      if (gigDates.length > 0) {
        gigDates.sort((a, b) => a - b);
        firstGigDate = gigDates[0];
        lastGigDate = gigDates[gigDates.length - 1];
      }
    }

    // Determine if this is a guest (no linked band member with stints)
    const isGuest = linkedBandMembers.length === 0 || linkedBandMembers.every(bm => !bm.stints || bm.stints.length === 0);

    res.json({
      user: membership.user,
      role: membership.role,
      joinedAt: membership.joinedAt,
      bandJoinDate: isGuest ? null : bandJoinDate, // Only for regular members with stints
      firstGigDate,
      lastGigDate,
      isGuest,
      achievements, // Combined member + band achievements, already formatted
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

// DEBUG: Diagnose gig count issues for current user (easy access)
router.get('/:workspaceId/debug-my-gigs', authenticate, isWorkspaceMember, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}, async (req, res) => {
  // Redirect to the full debug endpoint with current user's ID
  req.params.userId = req.user.id;
  // Fall through to the next handler
  const { workspaceId } = req.params;
  const userId = req.user.id;

  try {
    // Find band members linked to this user
    const linkedBandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: userId },
      select: { id: true, name: true }
    });
    const linkedBandMemberIds = linkedBandMembers.map(bm => bm.id);

    if (linkedBandMemberIds.length === 0) {
      return res.json({ error: 'No linked band members found for your account', linkedBandMembers: [], userId });
    }

    // Get ALL gigs
    const allGigs = await prisma.gig.findMany({
      where: { workspaceId, type: 'GIG' },
      include: {
        setlist: {
          include: {
            performers: {
              where: { bandMemberId: { in: linkedBandMemberIds } },
              select: { bandMemberId: true }
            }
          }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                performers: {
                  where: { bandMemberId: { in: linkedBandMemberIds } },
                  select: { bandMemberId: true }
                }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Analyze each gig
    const analysis = allGigs.map(gig => {
      const hasLegacySetlist = !!gig.setlistId;
      const hasMultiSet = gig.setlists && gig.setlists.length > 0;
      const legacyPerformed = gig.setlist?.performers?.length > 0;
      const multiSetPerformed = gig.setlists?.some(gs => gs.setlist?.performers?.length > 0);
      const userPerformed = legacyPerformed || multiSetPerformed;

      return {
        id: gig.id,
        title: gig.title,
        date: gig.date,
        hasLegacySetlist,
        hasMultiSet,
        legacyPerformed,
        multiSetPerformed,
        userPerformed,
        issue: !userPerformed ? (hasLegacySetlist || hasMultiSet ? 'NO_PERFORMER_RECORD' : 'NO_SETLIST_LINKED') : null
      };
    });

    const counted = analysis.filter(g => g.userPerformed).length;
    const notCounted = analysis.filter(g => !g.userPerformed);

    res.json({
      userId,
      linkedBandMembers,
      totalGigs: allGigs.length,
      countedGigs: counted,
      notCountedGigs: notCounted.length,
      issues: notCounted
    });
  } catch (error) {
    console.error('Debug my gigs error:', error);
    res.status(500).json({ error: 'Failed to debug gigs' });
  }
});

// DEBUG: Diagnose gig count issues for a member
router.get('/:workspaceId/members/:userId/debug-gigs', authenticate, isWorkspaceMember, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    // Find band members linked to this user
    const linkedBandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: userId },
      select: { id: true, name: true }
    });
    const linkedBandMemberIds = linkedBandMembers.map(bm => bm.id);

    if (linkedBandMemberIds.length === 0) {
      return res.json({ error: 'No linked band members found', linkedBandMembers: [] });
    }

    // Get ALL completed gigs
    const allGigs = await prisma.gig.findMany({
      where: { workspaceId, type: 'GIG' },
      include: {
        setlist: {
          include: {
            performers: {
              where: { bandMemberId: { in: linkedBandMemberIds } },
              select: { bandMemberId: true }
            }
          }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                performers: {
                  where: { bandMemberId: { in: linkedBandMemberIds } },
                  select: { bandMemberId: true }
                }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Analyze each gig
    const analysis = allGigs.map(gig => {
      const hasLegacySetlist = !!gig.setlistId;
      const hasMultiSet = gig.setlists && gig.setlists.length > 0;

      // Check if user performed via legacy setlist
      const legacyPerformed = gig.setlist?.performers?.length > 0;

      // Check if user performed via multi-set
      const multiSetPerformed = gig.setlists?.some(gs => gs.setlist?.performers?.length > 0);

      const userPerformed = legacyPerformed || multiSetPerformed;

      return {
        id: gig.id,
        title: gig.title,
        date: gig.date,
        hasLegacySetlist,
        hasMultiSet,
        legacyPerformed,
        multiSetPerformed,
        userPerformed,
        issue: !userPerformed ? (hasLegacySetlist || hasMultiSet ? 'NO_PERFORMER_RECORD' : 'NO_SETLIST_LINKED') : null
      };
    });

    const counted = analysis.filter(g => g.userPerformed).length;
    const notCounted = analysis.filter(g => !g.userPerformed);

    res.json({
      linkedBandMembers,
      totalGigs: allGigs.length,
      countedGigs: counted,
      notCountedGigs: notCounted.length,
      issues: notCounted
    });
  } catch (error) {
    console.error('Debug gigs error:', error);
    res.status(500).json({ error: 'Failed to debug gigs' });
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
      // Only include past rehearsals
      events = await prisma.gig.findMany({
        where: {
          workspaceId,
          type: 'REHEARSAL',
          date: { lt: new Date() },
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

// Export full workspace data as JSON download (admin only)
router.get('/:workspaceId/export', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true, bio: true, createdAt: true } } }
        },
        channels: {
          where: { isDirect: false },
          include: {
            members: { include: { user: { select: { id: true, displayName: true } } } },
            messages: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: { select: { id: true, displayName: true } },
                attachments: { select: { filename: true, url: true, type: true, size: true } },
                reactions: { include: { user: { select: { id: true, displayName: true } } } }
              }
            }
          }
        },
        songs: {
          include: {
            createdBy: { select: { displayName: true } },
            attachments: { select: { filename: true, url: true, type: true, size: true } }
          }
        },
        setlists: {
          include: {
            createdBy: { select: { displayName: true } },
            songs: { include: { song: { select: { title: true, artist: true } } }, orderBy: { position: 'asc' } },
            performers: { include: { bandMember: { select: { name: true } } } }
          }
        },
        gigs: {
          include: {
            createdBy: { select: { displayName: true } },
            setlists: { include: { setlist: { select: { name: true } } }, orderBy: { setNumber: 'asc' } },
            attendees: { include: { bandMember: { select: { name: true } } } },
            media: true,
            songsPlayed: { include: { song: { select: { title: true, artist: true } } } }
          }
        },
        bandMembers: {
          include: { instruments: true }
        },
        contacts: {
          include: { createdBy: { select: { displayName: true } } }
        },
        announcements: {
          include: {
            createdBy: { select: { displayName: true } },
            acknowledgments: { include: { user: { select: { displayName: true } } } }
          }
        },
        polls: {
          include: {
            createdBy: { select: { displayName: true } },
            options: { include: { votes: { include: { user: { select: { displayName: true } } } } } }
          }
        },
        timelineEvents: {
          include: { createdBy: { select: { displayName: true } } },
          orderBy: { eventDate: 'asc' }
        },
        recordings: {
          include: {
            createdBy: { select: { displayName: true } },
            song: { select: { title: true, artist: true } }
          }
        },
        medleys: {
          include: {
            createdBy: { select: { displayName: true } },
            songs: { include: { song: { select: { title: true, artist: true } } }, orderBy: { position: 'asc' } }
          }
        },
        kitty: {
          include: { transactions: { orderBy: { date: 'desc' } } }
        },
        memberAchievements: {
          include: {
            user: { select: { displayName: true } },
            achievement: { select: { name: true, description: true, icon: true, category: true } }
          }
        },
        bandAchievements: {
          include: {
            achievement: { select: { name: true, description: true, icon: true, category: true } }
          }
        },
        availability: {
          include: { user: { select: { displayName: true } } },
          orderBy: { date: 'asc' }
        }
      }
    });

    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    // Also export DM channels with messages
    const dmChannels = await prisma.channel.findMany({
      where: { workspaceId, isDirect: true },
      include: {
        members: { include: { user: { select: { id: true, displayName: true } } } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, displayName: true } },
            attachments: { select: { filename: true, url: true, type: true, size: true } },
            reactions: { include: { user: { select: { id: true, displayName: true } } } }
          }
        }
      }
    });

    const exportData = {
      exportDate: new Date().toISOString(),
      workspace: {
        name: workspace.name, createdAt: workspace.createdAt,
        inviteCode: workspace.inviteCode
      },
      members: workspace.members.map(m => ({
        displayName: m.user.displayName, email: m.user.email,
        role: m.role, joinedAt: m.joinedAt
      })),
      channels: workspace.channels.map(ch => ({
        name: ch.name, description: ch.description, isPrivate: ch.isPrivate,
        createdAt: ch.createdAt,
        members: ch.members.map(m => m.user.displayName),
        messages: ch.messages.map(msg => ({
          author: msg.author?.displayName || msg.removedUserName || 'Deleted User',
          content: msg.content, createdAt: msg.createdAt,
          attachments: msg.attachments,
          reactions: msg.reactions.map(r => ({ emoji: r.emoji, user: r.user?.displayName }))
        }))
      })),
      directMessages: dmChannels.map(ch => ({
        participants: ch.members.map(m => m.user.displayName),
        messages: ch.messages.map(msg => ({
          author: msg.author?.displayName || msg.removedUserName || 'Deleted User',
          content: msg.content, createdAt: msg.createdAt,
          attachments: msg.attachments,
          reactions: msg.reactions.map(r => ({ emoji: r.emoji, user: r.user?.displayName }))
        }))
      })),
      songs: workspace.songs.map(s => ({
        title: s.title, shortName: s.shortName, artist: s.artist,
        duration: s.duration, key: s.key, bpm: s.bpm,
        notes: s.notes, lyrics: s.lyrics, arrangement: s.arrangement,
        youtubeUrl: s.youtubeUrl, spotifyUrl: s.spotifyUrl,
        createdBy: s.createdBy?.displayName || s.removedCreatorName || 'Deleted User',
        createdAt: s.createdAt,
        attachments: s.attachments
      })),
      setlists: workspace.setlists.map(s => ({
        name: s.name, description: s.description, performedAt: s.performedAt,
        venue: s.venue, startTime: s.startTime,
        createdBy: s.createdBy?.displayName || s.removedCreatorName || 'Deleted User',
        songs: s.songs.map(ss => ({
          position: ss.position, type: ss.type, label: ss.label,
          song: ss.song ? `${ss.song.title}${ss.song.artist ? ` - ${ss.song.artist}` : ''}` : null
        })),
        performers: s.performers.map(p => p.bandMember.name)
      })),
      gigs: workspace.gigs.map(g => ({
        title: g.title, type: g.type, date: g.date, endDate: g.endDate,
        venue: g.venue, address: g.address, notes: g.notes,
        pay: g.pay, status: g.status,
        createdBy: g.createdBy?.displayName || g.removedCreatorName || 'Deleted User',
        setlists: g.setlists.map(gs => ({ setNumber: gs.setNumber, name: gs.setlist.name })),
        attendees: g.attendees.map(a => ({ name: a.bandMember.name, status: a.status })),
        media: g.media,
        songsPlayed: g.songsPlayed.map(gs => `${gs.song.title}${gs.song.artist ? ` - ${gs.song.artist}` : ''}`)
      })),
      bandMembers: workspace.bandMembers.map(bm => ({
        name: bm.name, imageUrl: bm.imageUrl, notes: bm.notes,
        instruments: bm.instruments.map(i => ({
          instrument: i.instrument, startDate: i.startDate, endDate: i.endDate
        }))
      })),
      contacts: workspace.contacts.map(c => ({
        name: c.name, category: c.category, email: c.email,
        phone: c.phone, website: c.website, address: c.address, notes: c.notes,
        createdBy: c.createdBy?.displayName || c.removedCreatorName || 'Deleted User'
      })),
      announcements: workspace.announcements.map(a => ({
        title: a.title, content: a.content, priority: a.priority,
        isPinned: a.isPinned, expiresAt: a.expiresAt,
        createdBy: a.createdBy?.displayName || a.removedCreatorName || 'Deleted User',
        createdAt: a.createdAt,
        acknowledgedBy: a.acknowledgments.map(ack => ({
          user: ack.user?.displayName || 'Deleted User', at: ack.acknowledgedAt
        }))
      })),
      polls: workspace.polls.map(p => ({
        question: p.question, description: p.description,
        allowMultiple: p.allowMultiple, isAnonymous: p.isAnonymous, isClosed: p.isClosed,
        createdBy: p.createdBy?.displayName || p.removedCreatorName || 'Deleted User',
        createdAt: p.createdAt,
        options: p.options.map(o => ({
          text: o.text, position: o.position,
          votes: p.isAnonymous ? o.votes.length : o.votes.map(v => v.user?.displayName || 'Deleted User')
        }))
      })),
      timeline: workspace.timelineEvents.map(t => ({
        title: t.title, description: t.description, eventType: t.eventType,
        eventDate: t.eventDate, imageUrl: t.imageUrl,
        createdBy: t.createdBy?.displayName || t.removedCreatorName || 'Deleted User'
      })),
      recordings: workspace.recordings.map(r => ({
        title: r.title, description: r.description, url: r.url,
        type: r.type, duration: r.duration,
        song: r.song ? `${r.song.title}${r.song.artist ? ` - ${r.song.artist}` : ''}` : null,
        createdBy: r.createdBy?.displayName || r.removedCreatorName || 'Deleted User',
        createdAt: r.createdAt
      })),
      medleys: workspace.medleys.map(m => ({
        name: m.name, description: m.description,
        createdBy: m.createdBy?.displayName || m.removedCreatorName || 'Deleted User',
        songs: m.songs.map(ms => `${ms.song.title}${ms.song.artist ? ` - ${ms.song.artist}` : ''}`)
      })),
      kitty: workspace.kitty ? {
        startingBalance: workspace.kitty.startingBalance,
        currency: workspace.kitty.currency,
        transactions: workspace.kitty.transactions.map(t => ({
          type: t.type, category: t.category, amount: t.amount,
          description: t.description, date: t.date,
          createdBy: t.createdBy?.displayName || t.removedCreatorName || 'Deleted User'
        }))
      } : null,
      achievements: {
        band: workspace.bandAchievements.map(a => ({
          name: a.achievement.name, icon: a.achievement.icon,
          category: a.achievement.category, earnedAt: a.earnedAt
        })),
        member: workspace.memberAchievements.map(a => ({
          user: a.user?.displayName || 'Deleted User',
          name: a.achievement.name, icon: a.achievement.icon,
          category: a.achievement.category, earnedAt: a.earnedAt
        }))
      },
      availability: workspace.availability.map(a => ({
        user: a.user?.displayName || 'Deleted User',
        date: a.date, status: a.status, note: a.note
      }))
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const sanitizedName = workspace.name.replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="bandchat-workspace-${sanitizedName}-${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    console.error('Export workspace error:', error);
    res.status(500).json({ error: 'Failed to export workspace data' });
  }
});

export default router;
