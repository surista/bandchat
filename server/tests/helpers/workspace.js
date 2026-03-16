import request from 'supertest';
import app from '../setup/app.js';
import prisma from './prisma.js';

/**
 * Create a test workspace. Returns the workspace object.
 */
export async function createTestWorkspace(token, overrides = {}) {
  const name = overrides.name || `Test Workspace ${Date.now()}`;

  const res = await request(app)
    .post('/api/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });

  if (res.status !== 201) {
    throw new Error(`Failed to create workspace: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Set test workspaces to PRO so all features are available
  await prisma.workspace.update({
    where: { id: res.body.id },
    data: { plan: 'PRO', planSource: 'MANUAL' },
  });

  return res.body;
}

/**
 * Add a member to a workspace via invite code.
 */
export async function addMemberToWorkspace(workspaceId, userToken, adminToken) {
  // Get the invite code
  const wsRes = await request(app)
    .get(`/api/workspaces/${workspaceId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  const inviteCode = wsRes.body.inviteCode;

  // Join with the invite code
  const joinRes = await request(app)
    .post(`/api/workspaces/join/${inviteCode}`)
    .set('Authorization', `Bearer ${userToken}`);

  if (joinRes.status !== 200) {
    throw new Error(`Failed to join workspace: ${joinRes.status} ${JSON.stringify(joinRes.body)}`);
  }

  return joinRes.body;
}

/**
 * Clean up a test workspace (cascade deletes handle relations).
 */
export async function cleanupWorkspace(workspaceId) {
  try {
    await prisma.workspace.delete({ where: { id: workspaceId } });
  } catch {
    // Workspace might already be deleted
  }
}

/**
 * Set workspace plan. Use to test FREE vs PRO gating.
 */
export async function setWorkspacePlan(workspaceId, plan, expiresAt = null) {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { plan, planSource: 'MANUAL', planExpiresAt: expiresAt },
  });
}
