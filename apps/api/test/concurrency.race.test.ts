import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';
import { verifyAllInvariants } from '../src/invariants/verify.js';

describe('Critical Concurrency & Race Tests (Milestone M2)', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  /**
   * Helper: creates a team with maxSize 5, prefilled with 4 members (leader + 3 members)
   * Leaving exactly 1 seat open.
   */
  async function fixtureTeamWithOneFreeSeat() {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const leader = await createTestUser({ displayName: 'Team Leader' });
    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);

    // Create team with maxSize: 5
    const createRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Contention Team', minSize: 2, maxSize: 5 });

    const teamId = createRes.body.data.id;

    // Prefill 3 members so memberCount = 4
    for (let i = 1; i <= 3; i++) {
      const member = await createTestUser({ displayName: `Initial Member ${i}` });
      const { sessionCookie: mCookie, csrfToken: mCsrf } = await createTestSession(member._id);

      const invRes = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({});

      const redeemRes = await request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', mCookie)
        .set('X-CSRF-Token', mCsrf)
        .send({ token: invRes.body.data.token });

      expect(redeemRes.status).toBe(200);
    }

    const db = getDatabase();
    const teamDoc = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(teamDoc?.memberCount).toBe(4);

    return {
      hackathon,
      teamId,
      leader,
      leaderCookie,
      leaderCsrf
    };
  }

  // --------------------------------------------------------------------------
  // RACE TEST 1: 50-User Last-Seat Race (Invite Path)
  // --------------------------------------------------------------------------
  it('RACE 1 (O-04): 50 distinct authenticated users race for the 1 remaining seat via invites; EXACTLY ONE succeeds', async () => {
    const { teamId, leaderCookie, leaderCsrf } = await fixtureTeamWithOneFreeSeat();

    // Generate 50 distinct single-use invite tokens
    const inviteTokens: string[] = [];
    for (let i = 0; i < 50; i++) {
      const invRes = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ expiresInHours: 24 });
      expect(invRes.status).toBe(201);
      inviteTokens.push(invRes.body.data.token);
    }

    // Provision 50 distinct authenticated users
    const racers: Array<{ cookie: string; csrf: string }> = [];
    for (let i = 0; i < 50; i++) {
      const user = await createTestUser({ displayName: `Racer ${i}` });
      const session = await createTestSession(user._id);
      racers.push({ cookie: session.sessionCookie, csrf: session.csrfToken });
    }

    // Launch all 50 redemption attempts simultaneously
    const responses = await Promise.all(
      racers.map((racer, index) =>
        request(app)
          .post('/api/v1/invites/redeem')
          .set('Cookie', racer.cookie)
          .set('X-CSRF-Token', racer.csrf)
          .set('Idempotency-Key', crypto.randomUUID())
          .send({ token: inviteTokens[index] })
      )
    );

    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200);
    const conflicts = statuses.filter((s) => s === 409);
    const serverErrors = statuses.filter((s) => s >= 500);

    // EXACTLY ONE must succeed!
    expect(successes.length).toBe(1);
    // EXACTLY 49 must receive conflict 409 TEAM_FULL
    expect(conflicts.length).toBe(49);
    // ZERO 5xx errors permitted
    expect(serverErrors.length).toBe(0);

    // Verify database state
    const db = getDatabase();
    const finalTeam = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(finalTeam?.memberCount).toBe(5);

    const totalMembers = await db.collection('memberships').countDocuments({ teamId: new ObjectId(teamId) });
    expect(totalMembers).toBe(5);

    // Verify invariants pass
    const { violations } = await verifyAllInvariants();
    expect(violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 2: 50 Concurrent Leader Approvals for 1 Seat
  // --------------------------------------------------------------------------
  it('RACE 2: 50 concurrent join request approvals for 1 remaining seat; EXACTLY ONE succeeds', async () => {
    const { teamId, leaderCookie, leaderCsrf } = await fixtureTeamWithOneFreeSeat();

    // 50 applicants submit requests
    const requestIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const applicant = await createTestUser({ displayName: `Applicant ${i}` });
      const { sessionCookie, csrfToken } = await createTestSession(applicant._id);

      const reqRes = await request(app)
        .post(`/api/v1/teams/${teamId}/requests`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ message: `I am applicant ${i}` });

      expect(reqRes.status).toBe(201);
      requestIds.push(reqRes.body.data.id);
    }

    // Leader concurrently fires all 50 approvals
    const responses = await Promise.all(
      requestIds.map((reqId) =>
        request(app)
          .post(`/api/v1/requests/${reqId}/approve`)
          .set('Cookie', leaderCookie)
          .set('X-CSRF-Token', leaderCsrf)
          .set('Idempotency-Key', crypto.randomUUID())
      )
    );

    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200);
    const conflicts = statuses.filter((s) => s === 409);
    const serverErrors = statuses.filter((s) => s >= 500);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(49);
    expect(serverErrors.length).toBe(0);

    const db = getDatabase();
    const finalTeam = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(finalTeam?.memberCount).toBe(5);

    const approvedRequests = await db.collection('join_requests').countDocuments({
      teamId: new ObjectId(teamId),
      status: 'approved'
    });
    expect(approvedRequests).toBe(1);

    const { violations } = await verifyAllInvariants();
    expect(violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 3: Cross-Team Race (Same User Concurrent Joins)
  // --------------------------------------------------------------------------
  it('RACE 3: user concurrently redeems invites for two different teams in same event; EXACTLY ONE membership commits', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const leaderA = await createTestUser({ displayName: 'Leader A' });
    const leaderB = await createTestUser({ displayName: 'Leader B' });

    const { sessionCookie: cookieA, csrfToken: csrfA } = await createTestSession(leaderA._id);
    const { sessionCookie: cookieB, csrfToken: csrfB } = await createTestSession(leaderB._id);

    // Create Team A
    const teamARes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA)
      .send({ name: 'Team Alpha', minSize: 2, maxSize: 5 });
    const teamAId = teamARes.body.data.id;

    // Create Team B
    const teamBRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', cookieB)
      .set('X-CSRF-Token', csrfB)
      .send({ name: 'Team Beta', minSize: 2, maxSize: 5 });
    const teamBId = teamBRes.body.data.id;

    // Leader A & B create invites
    const invA = await request(app)
      .post(`/api/v1/teams/${teamAId}/invites`)
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA)
      .send({});
    const invB = await request(app)
      .post(`/api/v1/teams/${teamBId}/invites`)
      .set('Cookie', cookieB)
      .set('X-CSRF-Token', csrfB)
      .send({});

    // Target User concurrently redeems both
    const racer = await createTestUser({ displayName: 'Dual Join Racer' });
    const { sessionCookie: racerCookie, csrfToken: racerCsrf } = await createTestSession(racer._id);

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', racerCookie)
        .set('X-CSRF-Token', racerCsrf)
        .send({ token: invA.body.data.token }),
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', racerCookie)
        .set('X-CSRF-Token', racerCsrf)
        .send({ token: invB.body.data.token })
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const db = getDatabase();
    // Verify user belongs to EXACTLY 1 team in the hackathon
    const memberships = await db.collection('memberships').find({
      hackathonId: hackathon._id,
      userId: racer._id
    }).toArray();
    expect(memberships.length).toBe(1);

    // Verify counts: winning team is 2, losing team is 1 (rollback worked!)
    const teamADoc = await db.collection('teams').findOne({ _id: new ObjectId(teamAId) });
    const teamBDoc = await db.collection('teams').findOne({ _id: new ObjectId(teamBId) });

    const totalCount = teamADoc!.memberCount + teamBDoc!.memberCount;
    expect(totalCount).toBe(3); // 1 leader in A, 1 leader in B, 1 racer in whichever won!
  });

  // --------------------------------------------------------------------------
  // RACE TEST 4: Duplicate Mutation Race (20 concurrent with same key)
  // --------------------------------------------------------------------------
  it('RACE 4: 20 simultaneous duplicate requests with the same Idempotency-Key create exactly one team', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const sharedKey = crypto.randomUUID();
    const payload = {
      name: 'Concurrent Idempotent Team',
      minSize: 2,
      maxSize: 5
    };

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
          .set('Cookie', sessionCookie)
          .set('X-CSRF-Token', csrfToken)
          .set('Idempotency-Key', sharedKey)
          .send(payload)
      )
    );

    // All must succeed (HTTP 201)
    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Concurrent Idempotent Team');
    }

    const replayedResponses = responses.filter((r) => r.headers['idempotency-replayed'] === 'true');
    expect(replayedResponses.length).toBe(19);

    const db = getDatabase();
    const teamCount = await db.collection('teams').countDocuments({ name: 'Concurrent Idempotent Team' });
    expect(teamCount).toBe(1);
    const memberCount = await db.collection('memberships').countDocuments({ userId: user._id });
    expect(memberCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 5: Leadership Race (Leader Leaving vs Incoming Joiner)
  // --------------------------------------------------------------------------
  it('RACE 5: leader leaves while an incoming applicant redeems an invite; team never becomes leaderless', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const leader = await createTestUser({ displayName: 'Leaving Leader' });
    const joiner = await createTestUser({ displayName: 'Incoming Joiner' });

    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
    const { sessionCookie: joinerCookie, csrfToken: joinerCsrf } = await createTestSession(joiner._id);

    const teamRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Succession Race Team', minSize: 2, maxSize: 5 });
    const teamId = teamRes.body.data.id;

    // Leader generates invite for joiner
    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    const token = invRes.body.data.token;

    // Concurrently execute: leader leaves vs joiner redeems
    const [leaveRes, redeemRes] = await Promise.all([
      request(app)
        .post(`/api/v1/teams/${teamId}/leave`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf),
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', joinerCookie)
        .set('X-CSRF-Token', joinerCsrf)
        .send({ token })
    ]);

    const db = getDatabase();
    const finalTeam = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });

    if (redeemRes.status === 200) {
      // Joiner committed first! Leader leave transferred leadership to joiner!
      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.data.teamDeleted).toBe(false);
      expect(leaveRes.body.data.successorId).toBe(joiner._id.toHexString());
      expect(finalTeam?.deletedAt).toBeNull();
      expect(finalTeam?.leaderId.toHexString()).toBe(joiner._id.toHexString());
      expect(finalTeam?.memberCount).toBe(1);
    } else {
      // Leader leave committed first! Team logically deleted; joiner got 404/409!
      expect(leaveRes.body.data.teamDeleted).toBe(true);
      expect([404, 409]).toContain(redeemRes.status);
      expect(finalTeam?.deletedAt).not.toBeNull();
      expect(finalTeam?.memberCount).toBe(0);
    }

    const { violations } = await verifyAllInvariants();
    expect(violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 8: Single-Use Invite Race
  // --------------------------------------------------------------------------
  it('RACE 8: two users concurrently attempt to redeem the SAME single-use invite; EXACTLY ONE succeeds', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const leader = await createTestUser();
    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);

    const teamRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Single Use Team', minSize: 2, maxSize: 5 });
    const teamId = teamRes.body.data.id;

    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    const token = invRes.body.data.token;

    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const { sessionCookie: cookie1, csrfToken: csrf1 } = await createTestSession(user1._id);
    const { sessionCookie: cookie2, csrfToken: csrf2 } = await createTestSession(user2._id);

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', cookie1)
        .set('X-CSRF-Token', csrf1)
        .send({ token }),
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', csrf2)
        .send({ token })
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const db = getDatabase();
    const teamDoc = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(teamDoc?.memberCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 9: Capacity Resize vs Admission Race
  // --------------------------------------------------------------------------
  it('RACE 9: leader shrinking maxSize concurrently with a user redeeming invite cannot violate capacity bounds', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const leader = await createTestUser();
    const joiner = await createTestUser();

    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
    const { sessionCookie: joinerCookie, csrfToken: joinerCsrf } = await createTestSession(joiner._id);

    // Initial team: min 1, max 3, count 1
    const teamRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Resize Contention Team', minSize: 1, maxSize: 3 });
    const teamId = teamRes.body.data.id;

    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});
    const token = invRes.body.data.token;

    // Leader shrinks maxSize to 1 concurrently with joiner attempting to join
    const [shrinkRes, redeemRes] = await Promise.all([
      request(app)
        .patch(`/api/v1/teams/${teamId}`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ maxSize: 1 }),
      request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', joinerCookie)
        .set('X-CSRF-Token', joinerCsrf)
        .send({ token })
    ]);

    expect([200, 409]).toContain(shrinkRes.status);
    expect([200, 409]).toContain(redeemRes.status);

    const db = getDatabase();
    const finalTeam = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });

    // Invariant: memberCount <= maxSize must NEVER be violated
    expect(finalTeam!.memberCount).toBeLessThanOrEqual(finalTeam!.maxSize);
    expect(finalTeam!.memberCount).toBeGreaterThanOrEqual(1);

    const { violations } = await verifyAllInvariants();
    expect(violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // RACE TEST 10: Terminal Lifecycle (Deleted Team Cannot Be Revived)
  // --------------------------------------------------------------------------
  it('RACE 10: attempting to join a logically deleted team is rejected with 404 TEAM_NOT_FOUND', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 5 });
    const soleMember = await createTestUser();
    const outsider = await createTestUser();

    const { sessionCookie: soleCookie, csrfToken: soleCsrf } = await createTestSession(soleMember._id);
    const { sessionCookie: outCookie, csrfToken: outCsrf } = await createTestSession(outsider._id);

    const teamRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', soleCookie)
      .set('X-CSRF-Token', soleCsrf)
      .send({ name: 'Doomed Team', minSize: 2, maxSize: 5 });
    const teamId = teamRes.body.data.id;

    // Create an invite before leaving
    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId}/invites`)
      .set('Cookie', soleCookie)
      .set('X-CSRF-Token', soleCsrf)
      .send({});
    const token = invRes.body.data.token;

    // Sole member leaves -> team deleted
    await request(app)
      .post(`/api/v1/teams/${teamId}/leave`)
      .set('Cookie', soleCookie)
      .set('X-CSRF-Token', soleCsrf);

    // Outsider tries to redeem the invite against the deleted team
    const redeemRes = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', outCookie)
      .set('X-CSRF-Token', outCsrf)
      .send({ token });

    expect(redeemRes.status).toBe(404);
    expect(redeemRes.body.error.code).toBe('TEAM_NOT_FOUND');

    const db = getDatabase();
    const finalTeam = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(finalTeam?.deletedAt).not.toBeNull();
    expect(finalTeam?.memberCount).toBe(0);
  });
});
