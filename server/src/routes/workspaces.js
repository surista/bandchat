import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { forceLeaveWorkspace } from '../socket/handlers.js';
import { getEffectivePlan, getPlanLimits, serializePlanLimits } from '../lib/planLimits.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Rate limiter for invite code join attempts (5 per 15 minutes per IP)
const inviteJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: process.env.NODE_ENV === 'test' ? () => true : undefined,
  message: { error: 'Too many join attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Generate a strong random invite code (10 chars, base64url)
const generateInviteCode = () => {
  return crypto.randomBytes(6).toString('base64url').substring(0, 10).toUpperCase();
};

const generateSlug = (name) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  const suffix = crypto.randomBytes(2).toString('hex'); // 4 chars
  return `${base}-${suffix}`;
};

// Get expiration date based on duration (in hours, null = never expires)
const getInviteExpiration = (hours = 24) => {
  if (hours === null || hours === 0) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

/**
 * Auto-elevate the longest-tenured non-admin member to admin.
 * Tie-breaker: alphabetical order by displayName.
 * @param {string} workspaceId - The workspace to check
 * @param {string} excludeUserId - User ID to exclude (the one leaving/being removed)
 * @returns {Promise<{userId: string, displayName: string}|null>} - Elevated user info or null if no candidates
 */
const autoElevateAdmin = async (workspaceId, excludeUserId) => {
  // Find the longest-tenured non-admin member (excluding the departing user)
  const candidate = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      role: 'MEMBER',
      userId: { not: excludeUserId }
    },
    orderBy: [
      { joinedAt: 'asc' },  // Longest-tenured first
    ],
    include: {
      user: { select: { id: true, displayName: true } }
    }
  });

  if (!candidate) {
    // No non-admin members to elevate; check if there are other admins
    const otherAdmin = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        role: 'ADMIN',
        userId: { not: excludeUserId }
      }
    });

    if (otherAdmin) {
      // Another admin exists, no elevation needed
      return null;
    }

    // No candidates and no other admins - workspace would be orphaned
    return null;
  }

  // If there are multiple candidates with same joinedAt, get all and sort alphabetically
  const candidates = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      role: 'MEMBER',
      userId: { not: excludeUserId },
      joinedAt: candidate.joinedAt
    },
    include: {
      user: { select: { id: true, displayName: true } }
    }
  });

  // Sort alphabetically by displayName for tie-breaker
  candidates.sort((a, b) =>
    (a.user.displayName || '').localeCompare(b.user.displayName || '')
  );

  const elevatedMember = candidates[0];

  // Promote to admin
  await prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId: elevatedMember.userId, workspaceId } },
    data: { role: 'ADMIN' }
  });

  return {
    userId: elevatedMember.userId,
    displayName: elevatedMember.user.displayName
  };
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
      effectivePlan: getEffectivePlan(wm.workspace),
      planLimits: serializePlanLimits(getPlanLimits(wm.workspace)),
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

    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Workspace name must be 100 characters or less' });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug: generateSlug(name.trim()),
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

    workspace.effectivePlan = getEffectivePlan(workspace);
    workspace.planLimits = serializePlanLimits(getPlanLimits(workspace));
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

    // Augment user avatars with BandMember imageUrl fallback
    const userIds = workspace.members.map(m => m.user.id);
    const bandMembers = await prisma.bandMember.findMany({
      where: { workspaceId: workspace.id, linkedUserId: { in: userIds }, imageUrl: { not: null } },
      select: { linkedUserId: true, imageUrl: true }
    });
    const bandAvatarMap = new Map(bandMembers.map(bm => [bm.linkedUserId, bm.imageUrl]));
    for (const member of workspace.members) {
      if (!member.user.avatarUrl && bandAvatarMap.has(member.user.id)) {
        member.user.avatarUrl = bandAvatarMap.get(member.user.id);
      }
    }

    // Strip invite fields for non-admins
    const membership = workspace.members?.find(m => m.userId === req.user.id);
    if (membership?.role !== 'ADMIN') {
      delete workspace.inviteCode;
      delete workspace.inviteCodeExpiresAt;
      delete workspace.inviteMaxUses;
      delete workspace.inviteUsedCount;
    }

    workspace.effectivePlan = getEffectivePlan(workspace);
    workspace.planLimits = serializePlanLimits(getPlanLimits(workspace));

    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

// Update workspace
router.put('/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { name, currency, defaultEventType, defaultStartTime, defaultEndTime, defaultVenue } = req.body;

    if (name && name.trim().length > 100) {
      return res.status(400).json({ error: 'Workspace name must be 100 characters or less' });
    }

    const validCurrencies = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','CNY','SEK','NZD','MXN','SGD','HKD','NOK','KRW','INR','BRL','ZAR','PHP','THB'];
    if (currency && !validCurrencies.includes(currency)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }

    const validTypes = ['GIG','REHEARSAL','RECORDING','OTHER'];
    if (defaultEventType && !validTypes.includes(defaultEventType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (defaultStartTime && !timeRegex.test(defaultStartTime)) {
      return res.status(400).json({ error: 'Invalid start time format' });
    }
    if (defaultEndTime && !timeRegex.test(defaultEndTime)) {
      return res.status(400).json({ error: 'Invalid end time format' });
    }

    if (defaultVenue !== undefined && defaultVenue && defaultVenue.length > 200) {
      return res.status(400).json({ error: 'Venue must be 200 characters or less' });
    }

    const workspace = await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: {
        ...(name && { name: name.trim() }),
        ...(currency && { currency }),
        ...(defaultEventType && { defaultEventType }),
        ...(defaultStartTime && { defaultStartTime }),
        ...(defaultEndTime && { defaultEndTime }),
        ...(defaultVenue !== undefined && { defaultVenue: defaultVenue || null }),
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
    const { workspaceId } = req.params;

    // Soft-delete: set deletedAt instead of hard-deleting
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() }
    });

    // Notify all members to leave the workspace room
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${workspaceId}`).emit('workspace:deleted', { workspaceId });
    }

    res.json({ message: 'Workspace scheduled for deletion. An admin can restore it within 30 days.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// Leave workspace
router.post('/:workspaceId/leave', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    // Check if user is the only member
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId }
    });

    if (memberCount === 1) {
      return res.status(400).json({ error: 'You are the only member. Delete the workspace instead.' });
    }

    // Check if user is the last admin
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } }
    });

    let elevatedUser = null;
    if (membership.role === 'ADMIN') {
      const adminCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' }
      });

      if (adminCount === 1) {
        // Try to auto-elevate another member
        elevatedUser = await autoElevateAdmin(workspaceId, userId);
        if (!elevatedUser) {
          return res.status(400).json({
            error: 'You are the last admin and there are no other members to promote. Delete the workspace instead.'
          });
        }
      }
    }

    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId, workspaceId } }
    });

    // M9: Force-evict the leaving user from workspace socket rooms
    const io = req.app.get('io');
    const wsChannels = await prisma.channel.findMany({
      where: { workspaceId },
      select: { id: true }
    });
    await forceLeaveWorkspace(io, userId, workspaceId, wsChannels.map(c => c.id));

    // Notify via socket if admin was elevated
    if (elevatedUser) {
      io.to(`workspace:${workspaceId}`).emit('member:elevated', {
        workspaceId,
        userId: elevatedUser.userId,
        displayName: elevatedUser.displayName,
        reason: 'Previous admin left the workspace'
      });
    }

    res.json({
      message: 'Left workspace',
      ...(elevatedUser && { elevatedAdmin: elevatedUser })
    });
  } catch (error) {
    console.error('Leave workspace error:', error);
    res.status(500).json({ error: 'Failed to leave workspace' });
  }
});

// Join workspace via invite code
router.post('/join/:inviteCode', inviteJoinLimiter, authenticate, async (req, res) => {
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

    // Check plan member limit
    const limits = getPlanLimits(workspace);
    if (limits.maxMembers !== Infinity) {
      const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: workspace.id } });
      if (memberCount >= limits.maxMembers) {
        return res.status(403).json({ error: `This workspace has reached its ${limits.maxMembers}-member limit. Ask an admin to upgrade to Pro.`, upgrade: true });
      }
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

    // Verify target user is a workspace member
    const targetMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } }
    });
    if (!targetMember) {
      return res.status(404).json({ error: 'User is not a member of this workspace' });
    }

    // Handle role update
    if (role) {
      if (!['ADMIN', 'MEMBER'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Check if demoting an admin would leave the workspace without any admins
      if (role === 'MEMBER' && targetMember.role === 'ADMIN') {
        const adminCount = await prisma.workspaceMember.count({
          where: { workspaceId, role: 'ADMIN' }
        });

        if (adminCount === 1) {
          return res.status(400).json({
            error: 'Cannot demote the only admin. Promote another member first.'
          });
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

      // Admins cannot change another user's email — users must change their own
      if (email !== undefined) {
        return res.status(403).json({ error: 'Email can only be changed by the account owner' });
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

    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Password must be 128 characters or less' });
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

    // Hash and update password, and revoke all refresh tokens for the user
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      }),
      prisma.refreshToken.deleteMany({
        where: { userId }
      })
    ]);

    res.json({ message: 'Password reset successfully. User has been logged out of all sessions.' });
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

    // Verify user is a member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } }
    });

    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this workspace' });
    }

    // Check if removing this user would leave the workspace without an admin
    let elevatedUser = null;
    if (membership.role === 'ADMIN') {
      const adminCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' }
      });

      if (adminCount === 1) {
        // This is the last admin - try to auto-elevate another member
        elevatedUser = await autoElevateAdmin(workspaceId, userId);
        if (!elevatedUser) {
          return res.status(400).json({
            error: 'Cannot remove the only admin. No other members available to promote.'
          });
        }
      }
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

    // M9: Force-evict the removed user from workspace socket rooms
    const io = req.app.get('io');
    await forceLeaveWorkspace(io, userId, workspaceId, channelIds);

    // Notify remaining members via socket
    io.to(`workspace:${workspaceId}`).emit('member:removed', {
      workspaceId,
      userId
    });

    // Notify if admin was auto-elevated
    if (elevatedUser) {
      io.to(`workspace:${workspaceId}`).emit('member:elevated', {
        workspaceId,
        userId: elevatedUser.userId,
        displayName: elevatedUser.displayName,
        reason: 'Previous admin was removed from the workspace'
      });
    }

    res.json({
      message: 'Member removed successfully',
      ...(elevatedUser && { elevatedAdmin: elevatedUser })
    });
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

    // Augment avatar with BandMember imageUrl fallback
    const userResponse = { ...membership.user };
    if (!userResponse.avatarUrl && linkedBandMembers.length > 0) {
      const bmWithImage = linkedBandMembers.find(bm => bm.imageUrl);
      if (bmWithImage) userResponse.avatarUrl = bmWithImage.imageUrl;
    }

    res.json({
      user: userResponse,
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
          include: { stints: true }
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
        bandKitty: {
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
        name: workspace.name, createdAt: workspace.createdAt
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
        isGuest: bm.isGuest, linkedUserId: bm.linkedUserId,
        stints: bm.stints.map(i => ({
          instruments: i.instruments, startDate: i.startDate, endDate: i.endDate
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
      kitty: workspace.bandKitty ? {
        startingBalance: workspace.bandKitty.startingBalance,
        currency: workspace.bandKitty.currency,
        transactions: workspace.bandKitty.transactions.map(t => ({
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

// Relink orphaned messages and sync band member avatars to user profiles
router.post('/:workspaceId/relink-messages', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Get workspace members with display names
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
    });

    // Build display name → userId map (case-insensitive, first match wins)
    const nameMap = new Map();
    for (const m of members) {
      const name = m.user.displayName?.toLowerCase();
      if (name && !nameMap.has(name)) {
        nameMap.set(name, m.user.id);
      }
    }

    // Also map BandMember.name → linkedUserId (handles "Simon" → Simon's userId)
    const bmLinked = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: { not: null } },
      select: { name: true, linkedUserId: true }
    });
    for (const bm of bmLinked) {
      const bmName = bm.name?.toLowerCase();
      if (bmName && !nameMap.has(bmName)) {
        nameMap.set(bmName, bm.linkedUserId);
      }
    }

    // 1. Relink orphaned messages (authorId null, removedUserName set)
    const orphanedMessages = await prisma.message.findMany({
      where: {
        authorId: null,
        removedUserName: { not: null },
        channel: { workspaceId }
      },
      select: { id: true, removedUserName: true }
    });

    let relinked = 0;
    const relinkSummary = {};

    for (const msg of orphanedMessages) {
      const rn = msg.removedUserName?.toLowerCase();
      // Exact match first
      let userId = nameMap.get(rn);
      // Fuzzy: startsWith in both directions (e.g., "simon" matches "simon lucas")
      if (!userId && rn) {
        for (const [key, uid] of nameMap) {
          if (key.startsWith(rn) || rn.startsWith(key)) {
            userId = uid;
            break;
          }
        }
      }
      if (userId) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { authorId: userId, removedUserName: null }
        });
        relinked++;
        const name = msg.removedUserName;
        relinkSummary[name] = (relinkSummary[name] || 0) + 1;
      }
    }

    // 2. Sync BandMember imageUrl → User avatarUrl for linked members without an avatar
    const bandMembers = await prisma.bandMember.findMany({
      where: {
        workspaceId,
        linkedUserId: { not: null },
        imageUrl: { not: null }
      },
      select: { linkedUserId: true, imageUrl: true }
    });

    let avatarsSynced = 0;
    for (const bm of bandMembers) {
      const result = await prisma.user.updateMany({
        where: { id: bm.linkedUserId, avatarUrl: null },
        data: { avatarUrl: bm.imageUrl }
      });
      avatarsSynced += result.count;
    }

    res.json({
      total: orphanedMessages.length,
      relinked,
      unmatched: orphanedMessages.length - relinked,
      avatarsSynced,
      summary: relinkSummary
    });
  } catch (error) {
    console.error('Relink messages error:', error);
    res.status(500).json({ error: 'Failed to relink messages' });
  }
});

// Get orphaned author names for manual mapping
router.get('/:workspaceId/orphaned-authors', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const orphans = await prisma.message.groupBy({
      by: ['removedUserName'],
      where: {
        authorId: null,
        removedUserName: { not: null },
        channel: { workspaceId }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
    });

    const bandMembers = await prisma.bandMember.findMany({
      where: { workspaceId, linkedUserId: { not: null } },
      select: {
        id: true, name: true, linkedUserId: true, imageUrl: true,
        linkedUser: { select: { id: true, displayName: true, avatarUrl: true } }
      }
    });

    res.json({
      orphanedNames: orphans.map(o => ({ name: o.removedUserName, count: o._count.id })),
      workspaceMembers: members.map(m => ({
        userId: m.user.id,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl
      })),
      bandMembers: bandMembers.map(bm => ({
        id: bm.id,
        name: bm.name,
        linkedUserId: bm.linkedUserId,
        displayName: bm.linkedUser?.displayName,
        avatarUrl: bm.imageUrl || bm.linkedUser?.avatarUrl
      }))
    });
  } catch (error) {
    console.error('Get orphaned authors error:', error);
    res.status(500).json({ error: 'Failed to get orphaned authors' });
  }
});

// Apply manual message mappings
router.post('/:workspaceId/apply-message-mappings', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { mappings } = req.body;

    if (!mappings || typeof mappings !== 'object' || Object.keys(mappings).length === 0) {
      return res.status(400).json({ error: 'mappings object is required' });
    }

    // Validate all target userIds are workspace members
    const memberUserIds = new Set(
      (await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true }
      })).map(m => m.userId)
    );

    for (const userId of Object.values(mappings)) {
      if (!memberUserIds.has(userId)) {
        return res.status(400).json({ error: 'One or more target users are not workspace members' });
      }
    }

    let totalMapped = 0;
    const summary = {};

    for (const [removedName, userId] of Object.entries(mappings)) {
      const result = await prisma.message.updateMany({
        where: {
          authorId: null,
          removedUserName: removedName,
          channel: { workspaceId }
        },
        data: { authorId: userId, removedUserName: null }
      });
      totalMapped += result.count;
      summary[removedName] = result.count;
    }

    res.json({ totalMapped, summary });
  } catch (error) {
    console.error('Apply message mappings error:', error);
    res.status(500).json({ error: 'Failed to apply mappings' });
  }
});

export default router;
