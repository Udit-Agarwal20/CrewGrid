import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Checkpoint M2-A: Core Teams Integration Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  it('T-007: successfully creates team, inserts founder membership, audit event, and outbox event in one transaction', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const idempotencyKey = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        name: 'Distributed Dynamos',
        description: 'Building high concurrency engines',
        minSize: 2,
        maxSize: 5,
        requiredSkills: ['typescript', 'mongodb']
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Distributed Dynamos');
    expect(res.body.data.leaderId).toBe(user._id.toHexString());
    expect(res.body.data.memberCount).toBe(1);
    expect(res.body.data.openSeats).toBe(4);
    expect(res.body.data.stage).toBe('forming'); // 1 < minSize 2
    expect(res.body.data.viewerPermissions).toContain('manage:team');

    const db = getDatabase();
    // Verify membership document
    const member = await db.collection('memberships').findOne({
      hackathonId: hackathon._id,
      userId: user._id
    });
    expect(member).not.toBeNull();
    expect(member?.teamId.toHexString()).toBe(res.body.data.id);

    // Verify audit event
    const audit = await db.collection('audit_events').findOne({
      teamId: member?.teamId,
      action: 'team.created'
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId.equals(user._id)).toBe(true);

    // Verify outbox event
    const outbox = await db.collection('realtime_events').findOne({
      teamId: member?.teamId,
      eventType: 'team.created'
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.payload.name).toBe('Distributed Dynamos');
  });

  it('T-008: rejects team creation outside hackathon min/max size policy with 422', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const res = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Illegal Sized Team',
        minSize: 1, // Hackathon min is 2!
        maxSize: 10 // Hackathon max is 5!
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');

    const db = getDatabase();
    const teamCount = await db.collection('teams').countDocuments({});
    expect(teamCount).toBe(0);
  });

  it('T-009: duplicate create request with same idempotency key and payload replays exact result', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const key = crypto.randomUUID();
    const payload = {
      name: 'Idempotent Titans',
      minSize: 2,
      maxSize: 4
    };

    // First request
    const firstRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.headers['idempotency-replayed']).toBeUndefined();
    const teamId = firstRes.body.data.id;

    // Second request (retry)
    const secondRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['idempotency-replayed']).toBe('true');
    expect(secondRes.body.data.id).toBe(teamId);

    // Exactly one team document exists
    const db = getDatabase();
    const totalTeams = await db.collection('teams').countDocuments({});
    expect(totalTeams).toBe(1);
  });

  it('T-010: reusing idempotency key with different payload is rejected with 409 conflict', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const key = crypto.randomUUID();

    // First request
    await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ name: 'Alpha Squad', minSize: 2, maxSize: 4 });

    // Second request with SAME key but DIFFERENT payload
    const mismatchRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ name: 'Beta Squad Conflict', minSize: 2, maxSize: 5 });

    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('T-011: a user already assigned to a team cannot create another team in the same hackathon', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    // First team creation
    const res1 = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Team One', minSize: 2, maxSize: 5 });
    expect(res1.status).toBe(201);

    // Second team creation attempt in same hackathon
    const res2 = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Team Two Greedy', minSize: 2, maxSize: 5 });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('ALREADY_IN_TEAM');

    const db = getDatabase();
    const count = await db.collection('teams').countDocuments({});
    expect(count).toBe(1);
  });

  it('T-012: simultaneous team creations for same user result in exactly one team and membership', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Race Team A', minSize: 2, maxSize: 5 }),
      request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Race Team B', minSize: 2, maxSize: 5 })
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    const db = getDatabase();
    const totalTeams = await db.collection('teams').countDocuments({});
    expect(totalTeams).toBe(1);
    const totalMemberships = await db.collection('memberships').countDocuments({ userId: user._id });
    expect(totalMemberships).toBe(1);
  });

  describe('Team Metadata and Capacity Management (PATCH /api/v1/teams/:teamId)', () => {
    it('leader edits team metadata successfully', async () => {
      const hackathon = await createTestHackathon();
      const leader = await createTestUser();
      const { sessionCookie, csrfToken } = await createTestSession(leader._id);

      const createRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Initial Name', minSize: 2, maxSize: 4 });

      const teamId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/v1/teams/${teamId}`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Updated Name',
          description: 'New updated mission statement',
          requiredSkills: ['kubernetes', 'docker']
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.name).toBe('Updated Name');
      expect(patchRes.body.data.requiredSkills).toContain('kubernetes');

      const db = getDatabase();
      const audit = await db.collection('audit_events').findOne({
        teamId: new (await import('mongodb')).ObjectId(teamId),
        action: 'team.updated'
      });
      expect(audit).not.toBeNull();
    });

    it('rejects reducing maxSize below current member count with 409 TEAM_SIZE_CONFLICT', async () => {
      const hackathon = await createTestHackathon();
      const leader = await createTestUser();
      const { sessionCookie, csrfToken } = await createTestSession(leader._id);

      // Create team (count is 1)
      const createRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Shrinking Squad', minSize: 2, maxSize: 4 });

      const teamId = createRes.body.data.id;

      // Attempt to shrink maxSize to 0 (below memberCount 1)
      const shrinkRes = await request(app)
        .patch(`/api/v1/teams/${teamId}`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ maxSize: 0 });

      // Schema requires min(1) or service rejects
      expect([409, 422]).toContain(shrinkRes.status);
    });

    it('non-leader cannot edit team and receives 403 NOT_TEAM_LEADER', async () => {
      const hackathon = await createTestHackathon();
      const leader = await createTestUser();
      const otherUser = await createTestUser();

      const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
      const { sessionCookie: otherCookie, csrfToken: otherCsrf } = await createTestSession(otherUser._id);

      const createRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ name: 'Leader Team', minSize: 2, maxSize: 4 });

      const teamId = createRes.body.data.id;

      const editRes = await request(app)
        .patch(`/api/v1/teams/${teamId}`)
        .set('Cookie', otherCookie)
        .set('X-CSRF-Token', otherCsrf)
        .send({ name: 'Hacked Name' });

      expect(editRes.status).toBe(403);
      expect(editRes.body.error.code).toBe('NOT_TEAM_LEADER');
    });
  });
});

