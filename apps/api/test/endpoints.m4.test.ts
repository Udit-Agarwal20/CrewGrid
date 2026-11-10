import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { connectToDatabase, closeDatabase, getDatabase } from '../src/db/client.js';
import { initializeIndexes } from '../src/db/indexes.js';
import { teamRepo } from '../src/modules/teams/team.repo.js';
import { membershipRepo } from '../src/modules/membership/membership.repo.js';

describe('Milestone M4 API Extensions', () => {
  const app = createApp();

  beforeAll(async () => {
    const { db } = await connectToDatabase();
    await initializeIndexes(db);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function createTestUser(displayName = 'Alice Tester') {
    const db = getDatabase();
    const userId = new ObjectId();
    const email = `test-${userId.toHexString()}@example.com`;
    await db.collection('users').insertOne({
      _id: userId,
      emailNormalized: email,
      passwordHash: 'dummy_hash',
      displayName,
      handle: `user_${userId.toHexString().slice(-6)}`,
      skills: ['TypeScript', 'React'],
      timezone: 'UTC',
      discoverable: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const token = new ObjectId().toHexString() + new ObjectId().toHexString();
    const crypto = await import('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');

    await db.collection('sessions').insertOne({
      _id: new ObjectId(),
      userId,
      tokenHash,
      csrfToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      revokedAt: null
    });

    return {
      userId,
      cookie: `crewgrid_session=${token}`,
      csrfToken
    };
  }

  async function createTestHackathon() {
    const db = getDatabase();
    const doc = {
      _id: new ObjectId(),
      slug: `hackathon-${Date.now()}`,
      title: 'Hack4Hack 2026',
      minTeamSize: 2,
      maxTeamSize: 5,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection('hackathons').insertOne(doc);
    return doc;
  }

  it('GET /api/v1/hackathons/:id returns single hackathon details', async () => {
    const hackathon = await createTestHackathon();
    const res = await request(app).get(`/api/v1/hackathons/${hackathon._id.toHexString()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(hackathon._id.toHexString());
    expect(res.body.data.title).toBe('Hack4Hack 2026');
  });

  it('GET /api/v1/hackathons/:id/teams/my-team returns null when unassigned', async () => {
    const user = await createTestUser();
    const hackathon = await createTestHackathon();

    const res = await request(app)
      .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams/my-team`)
      .set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('GET /api/v1/hackathons/:id/teams/my-team and GET /api/v1/teams/:id/members return assigned team and roster', async () => {
    const leader = await createTestUser('Leader Bob');
    const member = await createTestUser('Member Charlie');
    const hackathon = await createTestHackathon();

    const team = await teamRepo.createTeam({
      hackathonId: hackathon._id,
      name: 'Alpha Squad',
      description: 'Building great stuff',
      leaderId: leader.userId,
      minSize: 2,
      maxSize: 5,
      memberCount: 2,
      version: 1,
      deletedAt: null,
      requiredSkills: ['React', 'TypeScript'],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await membershipRepo.insertMembership({
      hackathonId: hackathon._id,
      teamId: team._id,
      userId: leader.userId,
      joinedAt: new Date()
    });

    await membershipRepo.insertMembership({
      hackathonId: hackathon._id,
      teamId: team._id,
      userId: member.userId,
      joinedAt: new Date()
    });

    // 1. Test my-team for leader
    const leaderMyTeam = await request(app)
      .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams/my-team`)
      .set('Cookie', leader.cookie);
    expect(leaderMyTeam.status).toBe(200);
    expect(leaderMyTeam.body.data.id).toBe(team._id.toHexString());
    expect(leaderMyTeam.body.data.viewerPermissions).toContain('manage:team');
    expect(leaderMyTeam.body.data.viewerPermissions).toContain('leave:team');

    // 2. Test my-team for member
    const memberMyTeam = await request(app)
      .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams/my-team`)
      .set('Cookie', member.cookie);
    expect(memberMyTeam.status).toBe(200);
    expect(memberMyTeam.body.data.id).toBe(team._id.toHexString());
    expect(memberMyTeam.body.data.viewerPermissions).toContain('leave:team');
    expect(memberMyTeam.body.data.viewerPermissions).not.toContain('manage:team');

    // 3. Test roster endpoint
    const rosterRes = await request(app)
      .get(`/api/v1/teams/${team._id.toHexString()}/members`)
      .set('Cookie', member.cookie);
    expect(rosterRes.status).toBe(200);
    expect(rosterRes.body.data.length).toBe(2);
    const leaderEntry = rosterRes.body.data.find((m: any) => m.userId === leader.userId.toHexString());
    const memberEntry = rosterRes.body.data.find((m: any) => m.userId === member.userId.toHexString());
    expect(leaderEntry.role).toBe('leader');
    expect(leaderEntry.displayName).toBe('Leader Bob');
    expect(memberEntry.role).toBe('member');
    expect(memberEntry.displayName).toBe('Member Charlie');
  });
});
