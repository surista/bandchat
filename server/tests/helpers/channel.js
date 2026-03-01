import request from 'supertest';
import app from '../setup/app.js';

/**
 * Create a test channel in a workspace.
 */
export async function createTestChannel(workspaceId, token, overrides = {}) {
  const res = await request(app)
    .post(`/api/channels/workspace/${workspaceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name || `test-channel-${Date.now()}`,
      isPrivate: overrides.isPrivate || false,
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create channel: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body;
}
