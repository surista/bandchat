import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import testPrisma from './helpers/prisma.js';
import appPrisma from '../src/lib/prisma.js';

// testPrisma: raw PrismaClient (no middleware) — for setup/teardown/direct DB access
// appPrisma: app's PrismaClient (with soft-delete middleware) — for testing middleware behavior

describe('Soft-Delete Middleware', () => {
  let activeUser, softDeletedUser;
  let workspaceId;

  beforeAll(async () => {
    activeUser = await createTestUser({ displayName: 'Active User' });
    softDeletedUser = await createTestUser({ displayName: 'Deleted User' });

    const ws = await createTestWorkspace(activeUser.token, { name: 'SoftDelete Middleware WS' });
    workspaceId = ws.id;

    // Soft-delete one user (use testPrisma to bypass middleware)
    await testPrisma.user.update({
      where: { id: softDeletedUser.user.id },
      data: { deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    // Restore soft-deleted user before cleanup
    await testPrisma.user.update({
      where: { id: softDeletedUser.user.id },
      data: { deletedAt: null },
    });

    await cleanupWorkspace(workspaceId);
    await cleanupUser(activeUser.user.id);
    await cleanupUser(softDeletedUser.user.id);
    await testPrisma.$disconnect();
  });

  describe('User soft-delete', () => {
    it('findUnique on soft-deleted user returns null', async () => {
      const user = await appPrisma.user.findUnique({
        where: { id: softDeletedUser.user.id },
      });
      expect(user).toBeNull();
    });

    it('findMany does not include soft-deleted user', async () => {
      const users = await appPrisma.user.findMany({
        where: { id: { in: [activeUser.user.id, softDeletedUser.user.id] } },
      });

      const ids = users.map(u => u.id);
      expect(ids).toContain(activeUser.user.id);
      expect(ids).not.toContain(softDeletedUser.user.id);
    });

    it('count excludes soft-deleted user', async () => {
      const count = await appPrisma.user.count({
        where: { id: { in: [activeUser.user.id, softDeletedUser.user.id] } },
      });
      expect(count).toBe(1);
    });

    it('findFirst with explicit deletedAt: { not: null } finds the deleted user (admin bypass)', async () => {
      const user = await appPrisma.user.findFirst({
        where: { id: softDeletedUser.user.id, deletedAt: { not: null } },
      });
      expect(user).not.toBeNull();
      expect(user.id).toBe(softDeletedUser.user.id);
    });

    it('findMany with deletedAt: { not: null } finds deleted users', async () => {
      const users = await appPrisma.user.findMany({
        where: {
          id: { in: [activeUser.user.id, softDeletedUser.user.id] },
          deletedAt: { not: null },
        },
      });

      expect(users.length).toBe(1);
      expect(users[0].id).toBe(softDeletedUser.user.id);
    });

    it('update on soft-deleted user by ID still works (no auto-filter on update)', async () => {
      const updated = await testPrisma.user.update({
        where: { id: softDeletedUser.user.id },
        data: { bio: 'Updated while soft-deleted' },
        select: { id: true, bio: true },
      });
      expect(updated.bio).toBe('Updated while soft-deleted');

      // Clean up
      await testPrisma.user.update({
        where: { id: softDeletedUser.user.id },
        data: { bio: null },
      });
    });
  });

  describe('Workspace soft-delete', () => {
    let softDeletedWorkspaceId;

    beforeAll(async () => {
      const ws = await createTestWorkspace(activeUser.token, { name: 'To Be Deleted WS' });
      softDeletedWorkspaceId = ws.id;

      // Soft-delete the workspace (use testPrisma)
      await testPrisma.workspace.update({
        where: { id: softDeletedWorkspaceId },
        data: { deletedAt: new Date() },
      });
    });

    afterAll(async () => {
      await testPrisma.workspace.update({
        where: { id: softDeletedWorkspaceId },
        data: { deletedAt: null },
      });
      await cleanupWorkspace(softDeletedWorkspaceId);
    });

    it('soft-deleted workspace not returned by findUnique', async () => {
      const ws = await appPrisma.workspace.findUnique({
        where: { id: softDeletedWorkspaceId },
      });
      expect(ws).toBeNull();
    });

    it('soft-deleted workspace not returned by findMany', async () => {
      const workspaces = await appPrisma.workspace.findMany({
        where: { id: { in: [workspaceId, softDeletedWorkspaceId] } },
      });

      const ids = workspaces.map(w => w.id);
      expect(ids).toContain(workspaceId);
      expect(ids).not.toContain(softDeletedWorkspaceId);
    });

    it('count excludes soft-deleted workspace', async () => {
      const count = await appPrisma.workspace.count({
        where: { id: { in: [workspaceId, softDeletedWorkspaceId] } },
      });
      expect(count).toBe(1);
    });

    it('admin bypass query with deletedAt filter finds soft-deleted workspace', async () => {
      const ws = await appPrisma.workspace.findFirst({
        where: { id: softDeletedWorkspaceId, deletedAt: { not: null } },
      });
      expect(ws).not.toBeNull();
      expect(ws.id).toBe(softDeletedWorkspaceId);
    });
  });

  describe('Edge Cases', () => {
    it('findUnique on soft-deleted user by ID returns null (middleware converts to findFirst)', async () => {
      const user = await appPrisma.user.findUnique({
        where: { id: softDeletedUser.user.id },
        select: { id: true, displayName: true },
      });
      expect(user).toBeNull();
    });

    it('WorkspaceMember is not a soft-delete model (not affected by middleware)', async () => {
      const membership = await appPrisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: activeUser.user.id,
            workspaceId: workspaceId,
          },
        },
      });
      expect(membership).not.toBeNull();
      expect(membership.userId).toBe(activeUser.user.id);
    });

    it('updateMany with soft-deleted model filters correctly', async () => {
      const result = await appPrisma.user.updateMany({
        where: { id: { in: [activeUser.user.id, softDeletedUser.user.id] } },
        data: { bio: 'Bulk update test' },
      });

      // Should only update the active user (soft-deleted is filtered out)
      expect(result.count).toBe(1);

      // Clean up
      await testPrisma.user.update({
        where: { id: activeUser.user.id },
        data: { bio: null },
      });
    });
  });
});
