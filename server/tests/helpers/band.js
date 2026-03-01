import request from 'supertest';
import app from '../setup/app.js';

/**
 * Create a test song in a workspace.
 */
export async function createTestSong(workspaceId, token, overrides = {}) {
  const res = await request(app)
    .post(`/api/songs/workspace/${workspaceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: overrides.title || `Test Song ${Date.now()}`,
      artist: overrides.artist || 'Test Artist',
      key: overrides.key || 'C',
      tempo: overrides.tempo || 120,
      duration: overrides.duration || 240,
      status: overrides.status || 'READY',
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create song: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body;
}

/**
 * Create a test setlist in a workspace.
 */
export async function createTestSetlist(workspaceId, token, overrides = {}) {
  const res = await request(app)
    .post(`/api/setlists/workspace/${workspaceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name || `Test Setlist ${Date.now()}`,
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create setlist: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body;
}

/**
 * Create a test gig in a workspace.
 */
export async function createTestGig(workspaceId, token, overrides = {}) {
  const date = overrides.date || new Date(Date.now() + 86400000).toISOString();

  const res = await request(app)
    .post(`/api/gigs/workspace/${workspaceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: overrides.title || `Test Gig ${Date.now()}`,
      date,
      type: overrides.type || 'GIG',
      venue: overrides.venue || 'Test Venue',
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create gig: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body;
}

/**
 * Create a test band member in a workspace.
 */
export async function createTestBandMember(workspaceId, token, overrides = {}) {
  const res = await request(app)
    .post(`/api/band-members/workspace/${workspaceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name || `Band Member ${Date.now()}`,
      role: overrides.role || 'Guitar',
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create band member: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body;
}
