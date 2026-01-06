import express from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Generate a random invite code
const generateInviteCode = () => {
  return uuidv4().split('-')[0].toUpperCase();
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

// Regenerate invite code
router.post('/:workspaceId/invite-code', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspace = await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: { inviteCode: generateInviteCode() }
    });

    res.json({ inviteCode: workspace.inviteCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

// Remove member from workspace
router.delete('/:workspaceId/members/:userId', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    // Can't remove yourself if you're the only admin
    if (userId === req.user.id) {
      const adminCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' }
      });

      if (adminCount === 1) {
        return res.status(400).json({ error: 'Cannot remove the only admin' });
      }
    }

    await prisma.workspaceMember.delete({
      where: {
        userId_workspaceId: { userId, workspaceId }
      }
    });

    // Notify via socket
    const io = req.app.get('io');
    io.to(`workspace:${workspaceId}`).emit('member:removed', {
      workspaceId,
      userId
    });

    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
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

export default router;
