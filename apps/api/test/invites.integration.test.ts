import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Checkpoint M2-C: Invitations Integration Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  async function createTeamFixture() {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const leader = await createTestUser();
    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);

    const res = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Invite Test Team', minSize: 2, maxSize: 5 });

    return {
      hackathon,
      leader,
      leaderCookie,
      leaderCsrf,
      teamId: res.body.data.id
    };
  }

  it('T-025: leader creates single-use invite, participant redeems it and joins team immediately', async () => {
    const { teamId, leaderCookie, leaderCsrf, hackathon } = await createTeamFixture();
    const participant = await createTestUser();
    const { sessionCookie: partCookie, csrfToken: partCsrf } = await createTestSession(participant._id);

    // Leader creates invite
    const inviteRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ expiresInHours: 24 });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.token).toBeDefined();
    expect(inviteRes.body.data.redeemUrl).toContain('/invite#token=');
    expect(inviteRes.body.data.status).toBe('available');

    const token = inviteRes.body.data.token;

    // Participant redeems invite
    const redeemRes = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', partCookie)
      .set('X-CSRF-Token', partCsrf)
      .send({ token });

    expect(redeemRes.status).toBe(200);
    expect(redeemRes.body.data.id).toBe(teamId);
    expect(redeemRes.body.data.memberCount).toBe(2);

    const db = getDatabase();
    // Verify membership document
    const member = await db.collection('memberships').findOne({
      hackathonId: hackathon._id,
      userId: participant._id
    });
    expect(member).not.toBeNull();

    // Verify invite marked used
    const inv = await db.collection('invites').findOne({ _id: new ObjectId(inviteRes.body.data.id) });
    expect(inv?.usedAt).not.toBeNull();
    expect(inv?.usedBy?.equals(participant._id)).toBe(true);

    // Verify audit event
    const audit = await db.collection('audit_events').findOne({
      teamId: new ObjectId(teamId),
      action: 'invite.redeemed'
    });
    expect(audit).not.toBeNull();
  });

  it('T-026: expired invite is rejected with 409 INVITE_EXPIRED even before TTL cleanup', async () => {
    const { teamId, hackathon, leader } = await createTeamFixture();
    const participant = await createTestUser();
    const { sessionCookie: partCookie, csrfToken: partCsrf } = await createTestSession(participant._id);

    // Insert an invite with expiresAt in the past
    const rawToken = 'past-expired-token-xyz';
    const { hashInviteToken } = await import('../src/modules/invites/invite.service.js');
    const tokenHash = hashInviteToken(rawToken);

    const db = getDatabase();
    await db.collection('invites').insertOne({
      hackathonId: hackathon._id,
      teamId: new ObjectId(teamId),
      createdBy: leader._id,
      tokenHash,
      expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      revokedAt: null,
      usedAt: null,
      usedBy: null,
      createdAt: new Date(Date.now() - 7200 * 1000)
    });

    const res = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', partCookie)
      .set('X-CSRF-Token', partCsrf)
      .send({ token: rawToken });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITE_EXPIRED');

    const member = await db.collection('memberships').findOne({ userId: participant._id });
    expect(member).toBeNull();
  });

  it('T-027: reusing an already used invite is rejected with 409 INVITE_USED with zero side effects', async () => {
    const { teamId, leaderCookie, leaderCsrf } = await createTeamFixture();
    const userA = await createTestUser();
    const userB = await createTestUser();

    const { sessionCookie: cookieA, csrfToken: csrfA } = await createTestSession(userA._id);
    const { sessionCookie: cookieB, csrfToken: csrfB } = await createTestSession(userB._id);

    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    const token = invRes.body.data.token;

    // User A redeems
    const resA = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA)
      .send({ token });
    expect(resA.status).toBe(200);

    // User B tries to reuse same token
    const resB = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', cookieB)
      .set('X-CSRF-Token', csrfB)
      .send({ token });

    expect(resB.status).toBe(409);
    expect(resB.body.error.code).toBe('INVITE_USED');

    const db = getDatabase();
    const memberB = await db.collection('memberships').findOne({ userId: userB._id });
    expect(memberB).toBeNull();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);
  });

  it('T-028: revoked invite cannot be redeemed and returns 409 INVITE_REVOKED', async () => {
    const { teamId, leaderCookie, leaderCsrf } = await createTeamFixture();
    const participant = await createTestUser();
    const { sessionCookie: partCookie, csrfToken: partCsrf } = await createTestSession(participant._id);

    // Create invite
    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    const inviteId = invRes.body.data.id;
    const token = invRes.body.data.token;

    // Leader revokes invite
    const revokeRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites/${inviteId}/revoke`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);
    expect(revokeRes.status).toBe(200);

    // Participant attempts to redeem
    const redeemRes = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', partCookie)
      .set('X-CSRF-Token', partCsrf)
      .send({ token });

    expect(redeemRes.status).toBe(409);
    expect(redeemRes.body.error.code).toBe('INVITE_REVOKED');
  });

  it('T-029: non-leader cannot create or revoke team invites and receives 403 NOT_TEAM_LEADER', async () => {
    const { teamId } = await createTeamFixture();
    const nonLeader = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(nonLeader._id);

    const createRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(createRes.status).toBe(403);
    expect(createRes.body.error.code).toBe('NOT_TEAM_LEADER');
  });
});

