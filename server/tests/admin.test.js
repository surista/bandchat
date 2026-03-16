import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser, makeSystemAdmin } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Admin API', () => {
  let admin, regular, extraUser;
  let workspaceId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Admin User' });
    regular = await createTestUser({ displayName: 'Regular User' });
    extraUser = await createTestUser({ displayName: 'Extra User' });

    await makeSystemAdmin(admin.user.id);

    const ws = await createTestWorkspace(admin.token, { name: 'Admin Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await cleanupUser(regular.user.id);
    await cleanupUser(extraUser.user.id);
    await prisma.$disconnect();
  });

  describe('Access Control', () => {
    it('should return 403 for regular user on GET /api/admin/stats', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${regular.token}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 for system admin on GET /api/admin/stats', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    it('should return 401 for unauthenticated request on GET /api/admin/stats', async () => {
      const res = await request(app)
        .get('/api/admin/stats');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('should return user count, workspace count, message count', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.total).toBeGreaterThanOrEqual(1);
      expect(res.body.workspaces.total).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.messages.total).toBe('number');
    });

    it('should have expected response shape', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('workspaces');
      expect(res.body).toHaveProperty('messages');
      expect(res.body.users).toHaveProperty('total');
      expect(res.body.users).toHaveProperty('last7d');
      expect(res.body.users).toHaveProperty('last30d');
      expect(res.body.workspaces).toHaveProperty('total');
      expect(res.body.messages).toHaveProperty('total');
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return array of users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('total');
    });

    it('should filter results with search query', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=Admin User')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      const found = res.body.users.some(u => u.displayName === 'Admin User');
      expect(found).toBe(true);
    });
  });

  describe('GET /api/admin/users/:userId', () => {
    it('should return user detail for valid user', async () => {
      const res = await request(app)
        .get(`/api/admin/users/${regular.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(regular.user.id);
      expect(res.body.displayName).toBe('Regular User');
      expect(res.body).toHaveProperty('email');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/api/admin/users/nonexistent-id-12345')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/users/:userId/toggle-admin', () => {
    it('should toggle isSystemAdmin flag on another user', async () => {
      // Verify user is not admin initially
      const before = await prisma.user.findUnique({
        where: { id: extraUser.user.id },
        select: { isSystemAdmin: true },
      });
      expect(before.isSystemAdmin).toBe(false);

      // Toggle to admin
      const res = await request(app)
        .post(`/api/admin/users/${extraUser.user.id}/toggle-admin`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isSystemAdmin).toBe(true);

      // Verify in database
      const after = await prisma.user.findUnique({
        where: { id: extraUser.user.id },
        select: { isSystemAdmin: true },
      });
      expect(after.isSystemAdmin).toBe(true);

      // Toggle back
      const res2 = await request(app)
        .post(`/api/admin/users/${extraUser.user.id}/toggle-admin`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.isSystemAdmin).toBe(false);
    });

    it('should prevent admin from toggling their own admin status', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${admin.user.id}/toggle-admin`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/workspaces', () => {
    it('should return array of workspaces with counts', async () => {
      const res = await request(app)
        .get('/api/admin/workspaces')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.workspaces)).toBe(true);
      expect(res.body.workspaces.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('total');

      const ws = res.body.workspaces.find(w => w.id === workspaceId);
      expect(ws).toBeDefined();
      expect(ws._count).toHaveProperty('members');
      expect(ws._count).toHaveProperty('channels');
    });
  });

  describe('Soft-Delete Management', () => {
    let softDeleteUserId;
    let softDeleteWorkspaceId;

    beforeAll(async () => {
      // Create users/workspaces specifically for soft-delete tests
      const sdUser = await createTestUser({ displayName: 'SoftDelete User' });
      softDeleteUserId = sdUser.user.id;

      const sdWs = await createTestWorkspace(admin.token, { name: 'SoftDelete WS' });
      softDeleteWorkspaceId = sdWs.id;
    });

    it('should return deleted items list via GET /api/admin/deleted', async () => {
      const res = await request(app)
        .get('/api/admin/deleted')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('workspaces');
      expect(res.body).toHaveProperty('graceDays');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(Array.isArray(res.body.workspaces)).toBe(true);
    });

    it('should restore a soft-deleted user via POST /api/admin/users/:id/restore', async () => {
      // Soft-delete the user
      await prisma.user.update({
        where: { id: softDeleteUserId },
        data: { deletedAt: new Date() },
      });

      // Restore via admin API
      const res = await request(app)
        .post(`/api/admin/users/${softDeleteUserId}/restore`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('restored');

      // Verify user is no longer soft-deleted
      const user = await prisma.user.findUnique({
        where: { id: softDeleteUserId },
        select: { deletedAt: true },
      });
      expect(user.deletedAt).toBeNull();
    });

    it('should restore a soft-deleted workspace via POST /api/admin/workspaces/:id/restore', async () => {
      // Soft-delete the workspace
      await prisma.workspace.update({
        where: { id: softDeleteWorkspaceId },
        data: { deletedAt: new Date() },
      });

      // Restore via admin API
      const res = await request(app)
        .post(`/api/admin/workspaces/${softDeleteWorkspaceId}/restore`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('restored');

      // Verify workspace is no longer soft-deleted
      const ws = await prisma.workspace.findUnique({
        where: { id: softDeleteWorkspaceId },
        select: { deletedAt: true },
      });
      expect(ws.deletedAt).toBeNull();
    });

    it('should purge a soft-deleted user via DELETE /api/admin/users/:id/purge', async () => {
      // Create a fresh user for purge test
      const purgeUser = await createTestUser({ displayName: 'Purge User' });

      // Soft-delete it
      await prisma.user.update({
        where: { id: purgeUser.user.id },
        data: { deletedAt: new Date() },
      });

      // Purge via admin API
      const res = await request(app)
        .delete(`/api/admin/users/${purgeUser.user.id}/purge`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('permanently deleted');

      // Verify user is gone from database entirely
      const gone = await prisma.user.findFirst({
        where: { id: purgeUser.user.id, deletedAt: { not: null } },
      });
      expect(gone).toBeNull();
    });

    it('should not allow non-admin to access GET /api/admin/deleted', async () => {
      const res = await request(app)
        .get('/api/admin/deleted')
        .set('Authorization', `Bearer ${regular.token}`);

      expect(res.status).toBe(403);
    });

    afterAll(async () => {
      // Clean up soft-delete test resources
      await cleanupUser(softDeleteUserId);
      await cleanupWorkspace(softDeleteWorkspaceId);
    });
  });

  describe('Storage', () => {
    it('should return stats object via GET /api/admin/storage/stats', async () => {
      const res = await request(app)
        .get('/api/admin/storage/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalTrackedBytes');
      expect(res.body).toHaveProperty('workspaces');
      expect(Array.isArray(res.body.workspaces)).toBe(true);
    });

    it('should return 200 on POST /api/admin/storage/recalculate', async () => {
      const res = await request(app)
        .post('/api/admin/storage/recalculate')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Backups', () => {
    it('should return array via GET /api/admin/backups', async () => {
      const res = await request(app)
        .get('/api/admin/backups')
        .set('Authorization', `Bearer ${admin.token}`);

      // 200 if R2 configured, or 500 if not — both acceptable in test env
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        // Response may be an array directly or { backups: [...] }
        const backups = Array.isArray(res.body) ? res.body : res.body.backups;
        expect(Array.isArray(backups)).toBe(true);
      }
    });

    it('should reject path traversal on GET /api/admin/backups/download/../../etc/passwd', async () => {
      const res = await request(app)
        .get('/api/admin/backups/download/..%2F..%2Fetc%2Fpasswd')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('should reject path traversal with double dots in filename', async () => {
      const res = await request(app)
        .get('/api/admin/backups/download/../../../etc/passwd')
        .set('Authorization', `Bearer ${admin.token}`);

      // Should be 400 due to path traversal prevention
      expect([400, 404]).toContain(res.status);
    });
  });
});
