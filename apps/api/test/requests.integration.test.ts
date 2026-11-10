import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Checkpoint M2-B & M2-C: Join Requests Integration Tests', () => {
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
      .send({ name: 'Testing Team', minSize: 2, maxSize: 5 });

    return {
      hackathon,
      leader,
      leaderCookie,
      leaderCsrf,
      teamId: res.body.data.id
    };
  }

  it('T-015: create pending join request successfully; does not reserve capacity', async () => {
    const { teamId } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(applicant._id);

    const res = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ message: 'I would love to build with your team!' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.teamId).toBe(teamId);
    expect(res.body.data.applicantId).toBe(applicant._id.toHexString());

    // Verify seat capacity was NOT reserved
    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(1); // Still 1!
  });

  it('T-016: duplicate pending request by same applicant is rejected with 409 ALREADY_PENDING', async () => {
    const { teamId } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(applicant._id);

    // First request
    const res1 = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ message: 'First attempt' });
    expect(res1.status).toBe(201);

    // Second request
    const res2 = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ message: 'Second duplicate attempt' });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('ALREADY_PENDING');

    const db = getDatabase();
    const count = await db.collection('join_requests').countDocuments({ teamId: new ObjectId(teamId) });
    expect(count).toBe(1);
  });

  it('T-017: non-leader cannot approve join requests and receives 403 NOT_TEAM_LEADER', async () => {
    const { teamId } = await createTeamFixture();
    const applicant = await createTestUser();
    const randomUser = await createTestUser();

    const { sessionCookie: appCookie, csrfToken: appCsrf } = await createTestSession(applicant._id);
    const { sessionCookie: randCookie, csrfToken: randCsrf } = await createTestSession(randomUser._id);

    const reqRes = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf)
      .send({});
    const requestId = reqRes.body.data.id;

    const approveRes = await request(app)
      .post(`/api/v1/requests/${requestId}/approve`)
      .set('Cookie', randCookie)
      .set('X-CSRF-Token', randCsrf);

    expect(approveRes.status).toBe(403);
    expect(approveRes.body.error.code).toBe('NOT_TEAM_LEADER');
  });

  it('T-018: leader approves request -> increments count, inserts membership, audits, and resolves request', async () => {
    const { teamId, leaderCookie, leaderCsrf, hackathon } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie: appCookie, csrfToken: appCsrf } = await createTestSession(applicant._id);

    const reqRes = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf)
      .send({ message: 'Ready to build' });
    const requestId = reqRes.body.data.id;

    const approveRes = await request(app)
      .post(`/api/v1/requests/${requestId}/approve`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    const db = getDatabase();
    // Verify team memberCount incremented
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);

    // Verify membership document
    const membership = await db.collection('memberships').findOne({
      hackathonId: hackathon._id,
      userId: applicant._id
    });
    expect(membership).not.toBeNull();
    expect(membership?.teamId.toHexString()).toBe(teamId);

    // Verify audit events recorded (both request.approved and member.joined)
    const audits = await db.collection('audit_events').find({ teamId: new ObjectId(teamId) }).toArray();
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('request.approved');
    expect(actions).toContain('member.joined');
  });

  it('T-019: leader declines request -> status becomes declined, no membership or count change', async () => {
    const { teamId, leaderCookie, leaderCsrf, hackathon } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie: appCookie, csrfToken: appCsrf } = await createTestSession(applicant._id);

    const reqRes = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf)
      .send({});
    const requestId = reqRes.body.data.id;

    const declineRes = await request(app)
      .post(`/api/v1/requests/${requestId}/decline`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.data.status).toBe('declined');

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(1);

    const membership = await db.collection('memberships').findOne({
      hackathonId: hackathon._id,
      userId: applicant._id
    });
    expect(membership).toBeNull();
  });

  it('T-020: applicant cancels pending request -> status becomes canceled', async () => {
    const { teamId } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie: appCookie, csrfToken: appCsrf } = await createTestSession(applicant._id);

    const reqRes = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf)
      .send({});
    const requestId = reqRes.body.data.id;

    const cancelRes = await request(app)
      .post(`/api/v1/requests/${requestId}/cancel`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('canceled');
  });

  it('T-021: re-approving an already resolved request returns 409 conflict and creates no duplicate membership', async () => {
    const { teamId, leaderCookie, leaderCsrf } = await createTeamFixture();
    const applicant = await createTestUser();
    const { sessionCookie: appCookie, csrfToken: appCsrf } = await createTestSession(applicant._id);

    const reqRes = await request(app)
      .post(`/api/v1/teams/${teamId}/requests`)
      .set('Cookie', appCookie)
      .set('X-CSRF-Token', appCsrf)
      .send({});
    const requestId = reqRes.body.data.id;

    // First approval
    const app1 = await request(app)
      .post(`/api/v1/requests/${requestId}/approve`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);
    expect(app1.status).toBe(200);

    // Second approval attempt
    const app2 = await request(app)
      .post(`/api/v1/requests/${requestId}/approve`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    expect(app2.status).toBe(409);
    expect(app2.body.error.code).toBe('REQUEST_ALREADY_RESOLVED');

    const db = getDatabase();
    const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
    expect(team?.memberCount).toBe(2);
  });
});

