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

      const { sessionCookie } = await createTestSession((await createTestUser())._id);

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
  });
});

