import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  clearTestCollections,
  createTestUser,
  createTestSession,
  createTestHackathon
} from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Checkpoint M3-A: Discovery & Profile Integration Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  // --------------------------------------------------------------------------
  // Profile (A-06, A-07)
  // --------------------------------------------------------------------------
  describe('Profile Management (GET & PATCH /api/v1/profile)', () => {
    it('A-06: returns authenticated user profile with public fields', async () => {
      const user = await createTestUser({ displayName: 'Ada Lovelace' });
      const { sessionCookie } = await createTestSession(user._id);

      const res = await request(app)
        .get('/api/v1/profile')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(user._id.toHexString());
      expect(res.body.data.displayName).toBe('Ada Lovelace');
      expect(res.body.data.skills).toBeDefined();
    });

    it('A-07: updates profile, skills, timezone, preferredHours and discoverability', async () => {
      const user = await createTestUser({ displayName: 'Grace Hopper' });
      const { sessionCookie, csrfToken } = await createTestSession(user._id);

      const updatePayload = {
        displayName: 'Admiral Hopper',
        handle: 'ghopper',
        bio: 'Compilers and COBOL',
        skills: ['compilers', 'assembly', 'cobol'],
        timezone: 'America/New_York',
        preferredHours: {
          startLocal: '08:00',
          endLocal: '17:00',
          days: [1, 2, 3, 4, 5]
        },
        discoverable: true
      };

      const res = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Admiral Hopper');
      expect(res.body.data.handle).toBe('ghopper');
      expect(res.body.data.bio).toBe('Compilers and COBOL');
      expect(res.body.data.skills).toEqual(['compilers', 'assembly', 'cobol']);
      expect(res.body.data.timezone).toBe('America/New_York');
      expect(res.body.data.preferredHours.startLocal).toBe('08:00');
      expect(res.body.data.discoverable).toBe(true);
    });

    it('rejects duplicate handle with 409 conflict', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const { sessionCookie: cookie1, csrfToken: csrf1 } = await createTestSession(user1._id);
      const { sessionCookie: cookie2, csrfToken: csrf2 } = await createTestSession(user2._id);

      await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', cookie1)
        .set('X-CSRF-Token', csrf1)
        .send({ handle: 'uniquehandle' });

      const res2 = await request(app)
        .patch('/api/v1/profile')
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', csrf2)
        .send({ handle: 'uniquehandle' });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // --------------------------------------------------------------------------
  // Team Discovery Board (A-09)
  // --------------------------------------------------------------------------
  describe('Team Discovery Board (GET /api/v1/hackathons/:hackathonId/teams)', () => {
    it('lists active teams with server-derived stage and openSeats', async () => {
      const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
      const leader = await createTestUser();
      const { sessionCookie, csrfToken } = await createTestSession(leader._id);

      // Create a team (count: 1, minSize: 2, maxSize: 5 -> stage: 'forming', openSeats: 4)
      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Pioneers Team',
          minSize: 2,
          maxSize: 5,
          requiredSkills: ['typescript', 'rust']
        });

      const boardRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie);

      expect(boardRes.status).toBe(200);
      expect(boardRes.body.data.length).toBe(1);
      const team = boardRes.body.data[0];
      expect(team.name).toBe('Pioneers Team');
      expect(team.stage).toBe('forming');
      expect(team.openSeats).toBe(4);
      expect(team.memberCount).toBe(1);
      expect(team.requiredSkills).toContain('typescript');
    });

    it('filters teams by search query', async () => {
      const hackathon = await createTestHackathon();
      const leader1 = await createTestUser();
      const leader2 = await createTestUser();
      const { sessionCookie: c1, csrfToken: t1 } = await createTestSession(leader1._id);
      const { sessionCookie: c2, csrfToken: t2 } = await createTestSession(leader2._id);

      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', c1)
        .set('X-CSRF-Token', t1)
        .send({ name: 'Alpha Cybernet', minSize: 2, maxSize: 4 });

      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', c2)
        .set('X-CSRF-Token', t2)
        .send({ name: 'Beta Orbital', minSize: 2, maxSize: 4 });

      const searchRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams?search=Alpha`)
        .set('Cookie', c1);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBe(1);
      expect(searchRes.body.data[0].name).toBe('Alpha Cybernet');
    });

    it('filters teams by required skill', async () => {
      const hackathon = await createTestHackathon();
      const leader1 = await createTestUser();
      const leader2 = await createTestUser();
      const { sessionCookie: c1, csrfToken: t1 } = await createTestSession(leader1._id);
      const { sessionCookie: c2, csrfToken: t2 } = await createTestSession(leader2._id);

      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', c1)
        .set('X-CSRF-Token', t1)
        .send({ name: 'Go Masters', minSize: 2, maxSize: 4, requiredSkills: ['golang', 'docker'] });

      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', c2)
        .set('X-CSRF-Token', t2)
        .send({ name: 'Python Pros', minSize: 2, maxSize: 4, requiredSkills: ['python', 'pytorch'] });

      const skillRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams?skill=golang`)
        .set('Cookie', c1);

      expect(skillRes.status).toBe(200);
      expect(skillRes.body.data.length).toBe(1);
      expect(skillRes.body.data[0].name).toBe('Go Masters');
    });

    it('filters teams by onlyOpen=true and excludes full teams', async () => {
      const hackathon = await createTestHackathon({ minTeamSize: 1, maxTeamSize: 2 });
      const leader = await createTestUser();
      const { sessionCookie: lCookie, csrfToken: lCsrf } = await createTestSession(leader._id);

      // Create a 1-person max team (instantly full upon creation!)
      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', lCookie)
        .set('X-CSRF-Token', lCsrf)
        .send({ name: 'Full Solo Team', minSize: 1, maxSize: 1 });

      const openRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams?onlyOpen=true`)
        .set('Cookie', lCookie);

      expect(openRes.status).toBe(200);
      expect(openRes.body.data.length).toBe(0);
    });

    it('paginates teams stably using cursor and limit', async () => {
      const hackathon = await createTestHackathon();

      for (let i = 1; i <= 5; i++) {
        const u = await createTestUser();
        const { sessionCookie, csrfToken } = await createTestSession(u._id);
        await request(app)
          .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
          .set('Cookie', sessionCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({ name: `Batch Team ${i}`, minSize: 2, maxSize: 4 });
      }

      const page1 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams?limit=3`)
        .set('Cookie', (await createTestSession((await createTestUser())._id)).sessionCookie);

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(3);
      expect(page1.body.meta.hasMore).toBe(true);
      expect(page1.body.meta.nextCursor).toBeDefined();

      // Page 2 using nextCursor
      const page2 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams?limit=3&cursor=${page1.body.meta.nextCursor}`)
        .set('Cookie', (await createTestSession((await createTestUser())._id)).sessionCookie);

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBe(2);
      expect(page2.body.meta.hasMore).toBe(false);

      // Verify no duplicates between pages
      const ids1 = page1.body.data.map((t: any) => t.id);
      const ids2 = page2.body.data.map((t: any) => t.id);
      for (const id of ids2) {
        expect(ids1).not.toContain(id);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Teammates Board (A-27)
  // --------------------------------------------------------------------------
  describe('Teammates Candidate Board (GET /api/v1/hackathons/:hackathonId/teammates)', () => {
    it('returns only unassigned, discoverable candidates', async () => {
      const hackathon = await createTestHackathon();

      // Candidate 1: discoverable, unassigned
      const cand1 = await createTestUser({ displayName: 'Available Cand' });
      const db = getDatabase();
      await db.collection('users').updateOne(
        { _id: cand1._id },
        { $set: { discoverable: true, skills: ['react', 'node.js'], timezone: 'Asia/Kolkata' } }
      );

      // Candidate 2: NOT discoverable
      const cand2 = await createTestUser({ displayName: 'Hidden Cand' });
      await db.collection('users').updateOne({ _id: cand2._id }, { $set: { discoverable: false } });

      // Candidate 3: assigned to a team in this hackathon
      const cand3 = await createTestUser({ displayName: 'Assigned Cand' });
      await db.collection('users').updateOne({ _id: cand3._id }, { $set: { discoverable: true } });
      const { sessionCookie: c3, csrfToken: t3 } = await createTestSession(cand3._id);
      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', c3)
        .set('X-CSRF-Token', t3)
        .send({ name: 'Cand3 Team', minSize: 2, maxSize: 4 });

      // Query teammate board
      const { sessionCookie: viewerCookie } = await createTestSession((await createTestUser())._id);
      const boardRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates`)
        .set('Cookie', viewerCookie);

      expect(boardRes.status).toBe(200);
      const names = boardRes.body.data.map((u: any) => u.displayName);
      expect(names).toContain('Available Cand');
      expect(names).not.toContain('Hidden Cand');
      expect(names).not.toContain('Assigned Cand');
    });

    it('filters candidates by skill and timezone', async () => {
      const hackathon = await createTestHackathon();
      const db = getDatabase();

      const userA = await createTestUser({ displayName: 'Rustacean' });
      await db.collection('users').updateOne(
        { _id: userA._id },
        { $set: { discoverable: true, skills: ['rust', 'wasm'], timezone: 'Europe/Berlin' } }
      );

      const userB = await createTestUser({ displayName: 'Pythonista' });
      await db.collection('users').updateOne(
        { _id: userB._id },
        { $set: { discoverable: true, skills: ['python', 'pandas'], timezone: 'Asia/Kolkata' } }
      );

      const viewer = await createTestUser();
      await db.collection('users').updateOne({ _id: viewer._id }, { $set: { discoverable: false } });
      const { sessionCookie } = await createTestSession(viewer._id);

      const skillRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?skill=rust`)
        .set('Cookie', sessionCookie);

      expect(skillRes.status).toBe(200);
      expect(skillRes.body.data.length).toBe(1);
      expect(skillRes.body.data[0].displayName).toBe('Rustacean');

      const tzRes = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?timezone=Asia/Kolkata`)
        .set('Cookie', sessionCookie);

      expect(tzRes.status).toBe(200);
      expect(tzRes.body.data.length).toBe(1);
      expect(tzRes.body.data[0].displayName).toBe('Pythonista');
    });

    it('paginates candidates stably across multiple pages without duplicates', async () => {
      const hackathon = await createTestHackathon();
      const db = getDatabase();

      const candidateIds: string[] = [];
      const baseTime = Date.now();
      for (let i = 0; i < 25; i++) {
        const u = await createTestUser({ displayName: `Batch Candidate ${i}` });
        await db.collection('users').updateOne(
          { _id: u._id },
          {
            $set: {
              discoverable: true,
              skills: ['typescript'],
              updatedAt: new Date(baseTime - i * 1000)
            }
          }
        );
        candidateIds.push(u._id.toHexString());
      }

      const viewer = await createTestUser();
      await db.collection('users').updateOne({ _id: viewer._id }, { $set: { discoverable: false } });
      const { sessionCookie } = await createTestSession(viewer._id);

      // Page 1: limit 10
      const page1 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?limit=10`)
        .set('Cookie', sessionCookie);

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(10);
      expect(page1.body.meta.hasMore).toBe(true);
      expect(page1.body.meta.nextCursor).toBeDefined();

      // Page 2: limit 10 using nextCursor
      const page2 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?limit=10&cursor=${page1.body.meta.nextCursor}`)
        .set('Cookie', sessionCookie);

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBe(10);
      expect(page2.body.meta.hasMore).toBe(true);
      expect(page2.body.meta.nextCursor).toBeDefined();

      // Page 3: limit 10 using page2 nextCursor (remaining 5)
      const page3 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?limit=10&cursor=${page2.body.meta.nextCursor}`)
        .set('Cookie', sessionCookie);

      expect(page3.status).toBe(200);
      expect(page3.body.data.length).toBe(5);
      expect(page3.body.meta.hasMore).toBe(false);
      expect(page3.body.meta.nextCursor).toBeNull();

      // Verify zero duplicates across all three pages
      const ids1 = page1.body.data.map((c: any) => c.id);
      const ids2 = page2.body.data.map((c: any) => c.id);
      const ids3 = page3.body.data.map((c: any) => c.id);

      const allFetched = [...ids1, ...ids2, ...ids3];
      expect(new Set(allFetched).size).toBe(25);
    });

    it('rejects malformed or corrupted pagination cursors with 400 VALIDATION_FAILED', async () => {
      const hackathon = await createTestHackathon();
      const db = getDatabase();
      const viewer = await createTestUser();
      await db.collection('users').updateOne({ _id: viewer._id }, { $set: { discoverable: false } });
      const { sessionCookie } = await createTestSession(viewer._id);

      // 1. Random non-base64 or invalid json
      const res1 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?cursor=invalid_not_base64_!@#`)
        .set('Cookie', sessionCookie);

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_FAILED');

      // 2. Base64 encoded but not valid json
      const res2 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?cursor=${Buffer.from('not json').toString('base64url')}`)
        .set('Cookie', sessionCookie);

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_FAILED');

      // 3. Base64 json with missing fields
      const res3 = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates?cursor=${Buffer.from(JSON.stringify({ u: 'bad' })).toString('base64url')}`)
        .set('Cookie', sessionCookie);

      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('preserves cross-hackathon eligibility: assigned in Hackathon B remains eligible in Hackathon A', async () => {
      const hackathonA = await createTestHackathon();
      const hackathonB = await createTestHackathon();
      const db = getDatabase();

      // Candidate User
      const candidate = await createTestUser({ displayName: 'Cross Event User' });
      await db.collection('users').updateOne(
        { _id: candidate._id },
        { $set: { discoverable: true, skills: ['docker'] } }
      );

      // User creates and joins a team in Hackathon B
      const { sessionCookie: candCookie, csrfToken: candCsrf } = await createTestSession(candidate._id);
      await request(app)
        .post(`/api/v1/hackathons/${hackathonB._id.toHexString()}/teams`)
        .set('Cookie', candCookie)
        .set('X-CSRF-Token', candCsrf)
        .send({ name: 'Team Hackathon B', minSize: 2, maxSize: 4 });

      // Viewer checks candidate board for Hackathon A
      const { sessionCookie: viewerCookie } = await createTestSession((await createTestUser())._id);
      const resA = await request(app)
        .get(`/api/v1/hackathons/${hackathonA._id.toHexString()}/teammates`)
        .set('Cookie', viewerCookie);

      expect(resA.status).toBe(200);
      const userIdsA = resA.body.data.map((c: any) => c.id);
      expect(userIdsA).toContain(candidate._id.toHexString());

      // But in Hackathon B, candidate is assigned and must NOT appear
      const resB = await request(app)
        .get(`/api/v1/hackathons/${hackathonB._id.toHexString()}/teammates`)
        .set('Cookie', viewerCookie);

      expect(resB.status).toBe(200);
      const userIdsB = resB.body.data.map((c: any) => c.id);
      expect(userIdsB).not.toContain(candidate._id.toHexString());
    });

    it('ensures private profile fields (email, passwordHash) are never leaked in candidate responses', async () => {
      const hackathon = await createTestHackathon();
      const db = getDatabase();

      const user = await createTestUser({ displayName: 'Private Candidate' });
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { discoverable: true, skills: ['security'] } }
      );

      const viewer = await createTestUser();
      await db.collection('users').updateOne({ _id: viewer._id }, { $set: { discoverable: false } });
      const { sessionCookie } = await createTestSession(viewer._id);
      const res = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates`)
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      const cand = res.body.data.find((c: any) => c.id === user._id.toHexString());
      expect(cand).toBeDefined();
      expect(cand.displayName).toBe('Private Candidate');
      expect(cand.email).toBeUndefined();
      expect(cand.emailNormalized).toBeUndefined();
      expect(cand.passwordHash).toBeUndefined();
    });

    it('stably sorts candidates with identical timestamps using _id tie-breaking', async () => {
      const hackathon = await createTestHackathon();
      const db = getDatabase();

      const sameDate = new Date('2026-06-01T12:00:00Z');
      const u1 = await createTestUser({ displayName: 'Tie Candidate 1' });
      const u2 = await createTestUser({ displayName: 'Tie Candidate 2' });
      const u3 = await createTestUser({ displayName: 'Tie Candidate 3' });

      await db.collection('users').updateMany(
        { _id: { $in: [u1._id, u2._id, u3._id] } },
        { $set: { discoverable: true, updatedAt: sameDate } }
      );

      const viewer = await createTestUser();
      await db.collection('users').updateOne({ _id: viewer._id }, { $set: { discoverable: false } });
      const { sessionCookie } = await createTestSession(viewer._id);
      const res = await request(app)
        .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/teammates`)
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: any) => c.id);
      const index1 = ids.indexOf(u1._id.toHexString());
      const index2 = ids.indexOf(u2._id.toHexString());
      const index3 = ids.indexOf(u3._id.toHexString());

      expect(index1).toBeGreaterThanOrEqual(0);
      expect(index2).toBeGreaterThanOrEqual(0);
      expect(index3).toBeGreaterThanOrEqual(0);

      // Verify descending _id ordering when updatedAt is identical
      const tieUsers = [u1, u2, u3].sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
      expect(ids[Math.min(index1, index2, index3)]).toBe(tieUsers[0]._id.toHexString());
    });
  });
});

