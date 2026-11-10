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
import { calculateWorkingOverlapHours } from '../src/modules/matching/matching.service.js';

describe('Checkpoint M3-B: Teammate Recommendation & Matching Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  // --------------------------------------------------------------------------
  // Unit tests for calculateWorkingOverlapHours
  // --------------------------------------------------------------------------
  describe('calculateWorkingOverlapHours', () => {
    it('returns 100% (>= 4.0 hours) overlap for users in same timezone with standard 9-18 hours', () => {
      const result = calculateWorkingOverlapHours('Asia/Kolkata', 'Asia/Kolkata');
      expect(result.valid).toBe(true);
      // 9 hours of total daily overlap
      expect(result.overlapHours).toBe(9);
    });

    it('returns exact overlap for partial timezone difference (e.g. Asia/Kolkata UTC+5:30 and UTC)', () => {
      const result = calculateWorkingOverlapHours('Asia/Kolkata', 'UTC');
      expect(result.valid).toBe(true);
      // Team: 09:00 - 18:00 UTC
      // Candidate in IST: 09:00 - 18:00 IST = 03:30 - 12:30 UTC
      // Overlap: 09:00 - 12:30 UTC = 3.5 hours
      expect(result.overlapHours).toBe(3.5);
    });

    it('returns 0 hours for opposite timezones with non-overlapping default hours', () => {
      // UTC and Pacific/Honolulu (UTC-10)
      // UTC 09:00-18:00
      // Honolulu 09:00-18:00 = 19:00-04:00 UTC
      const result = calculateWorkingOverlapHours('Pacific/Honolulu', 'UTC');
      expect(result.valid).toBe(true);
      expect(result.overlapHours).toBe(0);
    });

    it('handles custom preferred hours correctly', () => {
      const result = calculateWorkingOverlapHours(
        'UTC',
        'UTC',
        { startLocal: '10:00', endLocal: '14:00' }, // 4 hours
        { startLocal: '12:00', endLocal: '20:00' }  // overlaps 12:00-14:00 (2h)
      );
      expect(result.valid).toBe(true);
      expect(result.overlapHours).toBe(2);
    });

    it('returns valid=false and 0 hours if timezone is missing', () => {
      const result = calculateWorkingOverlapHours(undefined, 'UTC');
      expect(result.valid).toBe(false);
      expect(result.overlapHours).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Integration tests for GET /api/v1/teams/:teamId/suggestions (A-28)
  // --------------------------------------------------------------------------
  describe('Teammate Recommendation Endpoint (A-28)', () => {
    it('ranks candidates by complementary skills and timezone fit for team leader', async () => {
      const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
      const leader = await createTestUser({ displayName: 'Leader Bob' });
      const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);

      const db = getDatabase();
      // Set leader profile: skills ['python'], timezone 'UTC'
      await db.collection('users').updateOne(
        { _id: leader._id },
        { $set: { skills: ['python'], timezone: 'UTC', discoverable: true } }
      );

      // Create team with requiredSkills: ['python', 'kubernetes', 'react']
      // Leader has 'python', so missing required skills are ['kubernetes', 'react']
      const createRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({
          name: 'Cloud Architects',
          minSize: 2,
          maxSize: 5,
          requiredSkills: ['python', 'kubernetes', 'react']
        });

      const teamId = createRes.body.data.id;

      // Candidate 1: Covers BOTH missing skills ('kubernetes', 'react'), same timezone ('UTC')
      const cand1 = await createTestUser({ displayName: 'Perfect Candidate' });
      await db.collection('users').updateOne(
        { _id: cand1._id },
        { $set: { skills: ['kubernetes', 'react'], timezone: 'UTC', discoverable: true } }
      );

      // Candidate 2: Covers 1 missing skill ('kubernetes'), same timezone ('UTC')
      const cand2 = await createTestUser({ displayName: 'Half Candidate' });
      await db.collection('users').updateOne(
        { _id: cand2._id },
        { $set: { skills: ['kubernetes', 'flutter'], timezone: 'UTC', discoverable: true } }
      );

      // Candidate 3: Covers 0 missing skills, opposite timezone
      const cand3 = await createTestUser({ displayName: 'Irrelevant Candidate' });
      await db.collection('users').updateOne(
        { _id: cand3._id },
        { $set: { skills: ['c++'], timezone: 'Pacific/Honolulu', discoverable: true } }
      );

      const suggRes = await request(app)
        .get(`/api/v1/teams/${teamId}/suggestions`)
        .set('Cookie', leaderCookie);

      expect(suggRes.status).toBe(200);
      expect(suggRes.body.data.length).toBeGreaterThanOrEqual(3);

      const [first, second, third] = suggRes.body.data;

      // First should be Perfect Candidate:
      // Missing required = 2. Candidate 1 covers 2/2 -> C = 100
      // Timezone UTC/UTC overlap 9h >= 4h -> T = 100
      // Total score = 0.7*100 + 0.3*100 = 100
      expect(first.displayName).toBe('Perfect Candidate');
      expect(first.score).toBe(100);
      expect(first.components.complementarySkills).toBe(100);
      expect(first.components.timezoneFit).toBe(100);
      expect(first.reasons[0]).toContain('Covers kubernetes, react');

      // Second should be Half Candidate:
      // Covers 1/2 missing skills -> C = 50. T = 100.
      // Total score = 0.7*50 + 0.3*100 = 35 + 30 = 65
      expect(second.displayName).toBe('Half Candidate');
      expect(second.score).toBe(65);
      expect(second.components.complementarySkills).toBe(50);

      // Third should have lower score
      expect(third.displayName).toBe('Irrelevant Candidate');
      expect(third.score).toBe(0);
    });

    it('rejects non-leader access with 403 NOT_TEAM_LEADER', async () => {
      const hackathon = await createTestHackathon();
      const leader = await createTestUser();
      const nonLeader = await createTestUser();

      const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
      const { sessionCookie: nonLeaderCookie } = await createTestSession(nonLeader._id);

      const createRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ name: 'Leader Only Squad', minSize: 2, maxSize: 4 });

      const teamId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/teams/${teamId}/suggestions`)
        .set('Cookie', nonLeaderCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_TEAM_LEADER');
    });

    it('excludes users already assigned to another team in the hackathon', async () => {
      const hackathon = await createTestHackathon();
      const leader = await createTestUser();
      const { sessionCookie: lCookie, csrfToken: lCsrf } = await createTestSession(leader._id);

      const teamRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', lCookie)
        .set('X-CSRF-Token', lCsrf)
        .send({ name: 'Team Alpha', minSize: 2, maxSize: 4 });

      const teamId = teamRes.body.data.id;

      // Another user creates a separate team in this hackathon
      const otherLeader = await createTestUser({ displayName: 'Other Team Leader' });
      const { sessionCookie: oCookie, csrfToken: oCsrf } = await createTestSession(otherLeader._id);
      const db = getDatabase();
      await db.collection('users').updateOne(
        { _id: otherLeader._id },
        { $set: { discoverable: true, skills: ['react'] } }
      );

      await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', oCookie)
        .set('X-CSRF-Token', oCsrf)
        .send({ name: 'Team Beta', minSize: 2, maxSize: 4 });

      // Suggestions for Team Alpha must NOT include Other Team Leader
      const suggRes = await request(app)
        .get(`/api/v1/teams/${teamId}/suggestions`)
        .set('Cookie', lCookie);

      expect(suggRes.status).toBe(200);
      const userIds = suggRes.body.data.map((s: any) => s.userId);
      expect(userIds).not.toContain(otherLeader._id.toHexString());
    });
  });
});

