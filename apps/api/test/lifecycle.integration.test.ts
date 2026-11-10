import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Checkpoint M2-C: Team Lifecycle, Succession, and Departure Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  async function createTeamWithMembersFixture() {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const leader = await createTestUser({ displayName: 'Leader Alice' });
    const member1 = await createTestUser({ displayName: 'Member Bob' });
    const member2 = await createTestUser({ displayName: 'Member Charlie' });

    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
    const { sessionCookie: m1Cookie, csrfToken: m1Csrf } = await createTestSession(member1._id);
    const { sessionCookie: m2Cookie, csrfToken: m2Csrf } = await createTestSession(member2._id);

    // Create team
    const createRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Lifecycle Team', minSize: 2, maxSize: 5 });
    const teamId = createRes.body.data.id;

    // Member 1 joins via invite
    const inv1 = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', m1Cookie)
      .set('X-CSRF-Token', m1Csrf)
      .send({ token: inv1.body.data.token });

    // Member 2 joins via invite
    const inv2 = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', m2Cookie)
      .set('X-CSRF-Token', m2Csrf)
      .send({ token: inv2.body.data.token });

    return {
      hackathon,
      teamId,
      leader,
      leaderCookie,
      leaderCsrf,
      member1,
      m1Cookie,
      m1Csrf,
      member2,
      m2Cookie,
      m2Csrf
    };
  }

  it('T-030: regular member leaves voluntarily -> count decremented, membership deleted, audit recorded', async () => {
    const { teamId, member2, m2Cookie, m2Csrf } = await createTeamWithMembersFixture();

    const leaveRes = await request(app)
      .post(`/api/v1/teams/${teamId}/leave`)
      .set('Cookie', m2Cookie)
      .set('X-CSRF-Token', m2Csrf);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.data.teamDeleted).toBe(false);
    expect(leaveRes.body.data.successorId).toBeNull();

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);

    const membership = await db.collection('memberships').findOne({
      teamId: new ObjectId(teamId),
      userId: member2._id
    });
    expect(membership).toBeNull();

    const audit = await db.collection('audit_events').findOne({
      teamId: new ObjectId(teamId),
      actorId: member2._id,
      action: 'member.left'
    });
    expect(audit).not.toBeNull();
  });

  it('T-031: leader leaves with remaining members -> deterministic automatic succession to oldest member', async () => {
    const { teamId, leader, leaderCookie, leaderCsrf, member1 } = await createTeamWithMembersFixture();

    const leaveRes = await request(app)
      .post(`/api/v1/teams/${teamId}/leave`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.data.teamDeleted).toBe(false);
    // Member 1 joined before Member 2, so Member 1 must be the elected successor!
    expect(leaveRes.body.data.successorId).toBe(member1._id.toHexString());

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);
    expect(team?.leaderId.toHexString()).toBe(member1._id.toHexString());

    const formerLeaderMember = await db.collection('memberships').findOne({
      teamId: new ObjectId(teamId),
      userId: leader._id
    });
    expect(formerLeaderMember).toBeNull();

    // Verify succession audit event
    const audit = await db.collection('audit_events').findOne({
      teamId: new ObjectId(teamId),
      action: 'leader.transferred'
    });
    expect(audit).not.toBeNull();
    expect(audit?.subjectId?.toHexString()).toBe(member1._id.toHexString());
  });

  it('T-032: last member leaves -> team is logically deleted, memberCount becomes 0, zero active memberships', async () => {
    const hackathon = await createTestHackathon();
    const soleMember = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(soleMember._id);

    const createRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Solo Team', minSize: 2, maxSize: 5 });
    const teamId = createRes.body.data.id;

    // Sole member leaves
    const leaveRes = await request(app)
      .post(`/api/v1/teams/${teamId}/leave`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.data.teamDeleted).toBe(true);

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.deletedAt).not.toBeNull();
    expect(team?.memberCount).toBe(0);

    const activeMembers = await db.collection('memberships').find({ teamId: new ObjectId(teamId) }).toArray();
    expect(activeMembers.length).toBe(0);

    const deleteAudit = await db.collection('audit_events').findOne({
      teamId: new ObjectId(teamId),
      action: 'team.deleted'
    });
    expect(deleteAudit).not.toBeNull();

    // Terminal lifecycle: query for deleted team returns 404
    const getRes = await request(app)
      .get(`/api/v1/teams/${teamId}`)
      .set('Cookie', sessionCookie);
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('TEAM_NOT_FOUND');
  });

  it('T-033: non-leader cannot remove a member and receives 403 NOT_TEAM_LEADER', async () => {
    const { teamId, m1Cookie, m1Csrf, member2 } = await createTeamWithMembersFixture();

    const removeRes = await request(app)
      .delete(`/api/v1/teams/${teamId}/members/${member2._id.toHexString()}`)
      .set('Cookie', m1Cookie)
      .set('X-CSRF-Token', m1Csrf);

    expect(removeRes.status).toBe(403);
    expect(removeRes.body.error.code).toBe('NOT_TEAM_LEADER');
  });

  it('T-034: leader removes non-leader member successfully -> member removed, count decremented, audit recorded', async () => {
    const { teamId, leaderCookie, leaderCsrf, member2 } = await createTeamWithMembersFixture();

    const removeRes = await request(app)
      .delete(`/api/v1/teams/${teamId}/members/${member2._id.toHexString()}`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    expect(removeRes.status).toBe(204);

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);

    const membership = await db.collection('memberships').findOne({
      teamId: new ObjectId(teamId),
      userId: member2._id
    });
    expect(membership).toBeNull();

    const audit = await db.collection('audit_events').findOne({
      teamId: new ObjectId(teamId),
      action: 'member.removed',
      subjectId: member2._id
    });
    expect(audit).not.toBeNull();
  });

  it('T-035: leader transfers leadership to a valid member; cannot transfer to non-member', async () => {
    const { teamId, leaderCookie, leaderCsrf, member1 } = await createTeamWithMembersFixture();
    const outsider = await createTestUser();

    // 1. Transfer to non-member fails with 409
    const invalidTransfer = await request(app)
      .post(`/api/v1/teams/${teamId}/transfer-leadership`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ newLeaderId: outsider._id.toHexString() });

    expect(invalidTransfer.status).toBe(409);
    expect(invalidTransfer.body.error.code).toBe('VALIDATION_FAILED');

    // 2. Transfer to valid member succeeds
    const validTransfer = await request(app)
      .post(`/api/v1/teams/${teamId}/transfer-leadership`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ newLeaderId: member1._id.toHexString() });

    expect(validTransfer.status).toBe(200);
    expect(validTransfer.body.data.leaderId).toBe(member1._id.toHexString());

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.leaderId.toHexString()).toBe(member1._id.toHexString());
  });
});
