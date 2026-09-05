import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from './setup/app.js';
import { createTestUser, cleanupUser } from './helpers/auth.js';
import { createTestWorkspace, cleanupWorkspace } from './helpers/workspace.js';
import { createTestSong, createTestSetlist, createTestGig } from './helpers/band.js';
import prisma from './helpers/prisma.js';

describe('Public Show Page API', () => {
  let admin;
  let workspace;

  beforeAll(async () => {
    admin = await createTestUser({ displayName: 'Show Admin' });
    workspace = await createTestWorkspace(admin.token);
  });

  afterAll(async () => {
    await cleanupWorkspace(workspace.id);
    await cleanupUser(admin.user.id);
    await prisma.$disconnect();
  });

  async function makePublicGigWithSetlist() {
    const song = await createTestSong(workspace.id, admin.token);
    const setlist = await createTestSetlist(workspace.id, admin.token);
    await request(app)
      .post(`/api/setlists/${setlist.id}/songs`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ songId: song.id });

    const gig = await createTestGig(workspace.id, admin.token);
    await request(app)
      .post(`/api/gigs/${gig.id}/setlists`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ setlistId: setlist.id, setNumber: 1 });
    const publicRes = await request(app)
      .put(`/api/gigs/${gig.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isPublic: true });
    expect(publicRes.status).toBe(200);

    return { gig, setlist, song };
  }

  it('returns 404 for a gig that is not public', async () => {
    const gig = await createTestGig(workspace.id, admin.token);

    const res = await request(app).get(`/api/public/shows/${gig.id}`);

    expect(res.status).toBe(404);
  });

  it('withholds the setlist for an upcoming (not-yet-completed) public gig', async () => {
    const { gig } = await makePublicGigWithSetlist();

    const res = await request(app).get(`/api/public/shows/${gig.id}`);

    expect(res.status).toBe(200);
    expect(res.body.setlistRevealed).toBe(false);
    expect(res.body.setlist).toEqual([]);
    // Everything else still renders, since this is also the pre-show promo page.
    expect(res.body.title).toBe(gig.title);
  });

  it('reveals the setlist once the gig is marked completed', async () => {
    const { gig, song } = await makePublicGigWithSetlist();

    const completeRes = await request(app)
      .put(`/api/gigs/${gig.id}/complete`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ songIds: [song.id] });
    expect(completeRes.status).toBe(200);

    const res = await request(app).get(`/api/public/shows/${gig.id}`);

    expect(res.status).toBe(200);
    expect(res.body.setlistRevealed).toBe(true);
    expect(res.body.setlist.some((item) => item.type === 'song' && item.title === song.title)).toBe(true);
  });
});
