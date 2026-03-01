import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import prisma from './helpers/prisma.js';

describe('Contacts API', () => {
  let admin;
  let workspaceId;
  let contactId;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Contact Admin' });
    const ws = await createTestWorkspace(admin.token, { name: 'Contact Test WS' });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  describe('POST /api/contacts/workspace/:workspaceId', () => {
    it('should create a contact', async () => {
      const res = await request(app)
        .post(`/api/contacts/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'John Sound Guy',
          email: 'john@venue.com',
          phone: '+1234567890',
          category: 'VENUE',
          notes: 'Sound engineer at The Venue',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('John Sound Guy');

      contactId = res.body.id;
    });
  });

  describe('GET /api/contacts/workspace/:workspaceId', () => {
    it('should return all contacts', async () => {
      const res = await request(app)
        .get(`/api/contacts/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });

    it('should filter by category', async () => {
      const res = await request(app)
        .get(`/api/contacts/workspace/${workspaceId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ category: 'VENUE' });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /api/contacts/:contactId', () => {
    it('should return contact details', async () => {
      const res = await request(app)
        .get(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('John Sound Guy');
    });
  });

  describe('PUT /api/contacts/:contactId', () => {
    it('should update a contact', async () => {
      const res = await request(app)
        .put(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ phone: '+0987654321' });

      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('+0987654321');
    });
  });

  describe('DELETE /api/contacts/:contactId', () => {
    it('should delete a contact', async () => {
      const res = await request(app)
        .delete(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
