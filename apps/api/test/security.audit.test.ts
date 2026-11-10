import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { clearTestCollections, createTestUser, createTestSession, createTestHackathon } from './setup.js';
import { getDatabase } from '../src/db/client.js';

describe('Milestone M5 — Production Security & RBAC Audit', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  describe('1. Authentication Boundary Enforcement', () => {
    it('blocks mutations with 401 UNAUTHENTICATED when session cookie is missing', async () => {
      const hackathon = await createTestHackathon();

      // Team creation without auth
      const teamRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .send({ name: 'Unauthorized Team' });
      expect(teamRes.status).toBe(401);
      expect(teamRes.body.error.code).toBe('UNAUTHENTICATED');
      expect(teamRes.body.meta.requestId).toBeDefined();

      // Invite redemption without auth
      const inviteRes = await request(app)
        .post('/api/v1/invites/redeem')
        .send({ token: 'dummy-token' });
      expect(inviteRes.status).toBe(401);
      expect(inviteRes.body.error.code).toBe('UNAUTHENTICATED');

      // Private profile endpoints without auth
      const meRes = await request(app).get('/api/v1/auth/me');
      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects forged or tampered session tokens', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', 'crewgrid_session=forged_token_value_xyz123');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('2. CSRF Defense & Header Verification', () => {
    it('blocks state-changing POST requests if X-CSRF-Token is omitted', async () => {
      const user = await createTestUser();
      const { sessionCookie } = await createTestSession(user._id);
      const hackathon = await createTestHackathon();

      const res = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie) // Valid session but no CSRF
        .send({ name: 'CSRF Attack Team' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_FAILED');
    });

    it('blocks state-changing requests if X-CSRF-Token is invalid or tampered', async () => {
      const user = await createTestUser();
      const { sessionCookie } = await createTestSession(user._id);
      const hackathon = await createTestHackathon();

      const res = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', 'tampered-or-forged-csrf-token')
        .send({ name: 'CSRF Attack Team' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_FAILED');
    });

    it('allows safe read-only GET requests without X-CSRF-Token', async () => {
      const user = await createTestUser();
      const { sessionCookie } = await createTestSession(user._id);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe(user.displayName);
    });
  });

  describe('3. Role-Based Access Control (RBAC)', () => {
    async function fixtureTeamWithLeaderAndMember() {
      const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
      const leader = await createTestUser({ displayName: 'Legit Leader' });
      const member = await createTestUser({ displayName: 'Regular Member' });
      const stranger = await createTestUser({ displayName: 'Stranger' });

      const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
      const { sessionCookie: memberCookie, csrfToken: memberCsrf } = await createTestSession(member._id);
      const { sessionCookie: strangerCookie, csrfToken: strangerCsrf } = await createTestSession(stranger._id);

      // Create team
      const teamRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ name: 'RBAC Team', minSize: 2, maxSize: 5 });
      const teamId = teamRes.body.data.id;

      // Add regular member via invite
      const invRes = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({});
      await request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', memberCookie)
        .set('X-CSRF-Token', memberCsrf)
        .send({ token: invRes.body.data.token });

      return {
        hackathon,
        teamId,
        leader,
        leaderCookie,
        leaderCsrf,
        member,
        memberCookie,
        memberCsrf,
        stranger,
        strangerCookie,
        strangerCsrf
      };
    }

    it('denies invite creation to non-leader team members with 403 NOT_TEAM_LEADER', async () => {
      const { teamId, memberCookie, memberCsrf } = await fixtureTeamWithLeaderAndMember();

      const res = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', memberCookie)
        .set('X-CSRF-Token', memberCsrf)
        .send({ expiresInHours: 24 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_TEAM_LEADER');
    });

    it('denies team configuration updates (PATCH) to non-leader members', async () => {
      const { teamId, memberCookie, memberCsrf } = await fixtureTeamWithLeaderAndMember();

      const res = await request(app)
        .patch(`/api/v1/teams/${teamId}`)
        .set('Cookie', memberCookie)
        .set('X-CSRF-Token', memberCsrf)
        .send({ name: 'Hijacked Team Name' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_TEAM_LEADER');
    });

    it('denies join request resolution (approve/decline) to non-leaders', async () => {
      const { teamId, strangerCookie, strangerCsrf, memberCookie, memberCsrf } =
        await fixtureTeamWithLeaderAndMember();

      // Stranger applies
      const reqRes = await request(app)
        .post(`/api/v1/teams/${teamId}/requests`)
        .set('Cookie', strangerCookie)
        .set('X-CSRF-Token', strangerCsrf)
        .send({ message: 'Let me in' });
      const requestId = reqRes.body.data.id;

      // Regular member attempts to approve
      const approveRes = await request(app)
        .post(`/api/v1/requests/${requestId}/approve`)
        .set('Cookie', memberCookie)
        .set('X-CSRF-Token', memberCsrf);

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error.code).toBe('NOT_TEAM_LEADER');
    });
  });

  describe('4. Invite Token Secrecy & Single-Use Enforcement', () => {
    it('never stores plaintext invite tokens in the database (SHA-256 hash only)', async () => {
      const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
      const leader = await createTestUser();
      const { sessionCookie, csrfToken } = await createTestSession(leader._id);

      const teamRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Hash Test Team', minSize: 2, maxSize: 5 });
      const teamId = teamRes.body.data.id;

      const invRes = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      const rawToken = invRes.body.data.token;
      expect(rawToken).toBeDefined();

      const db = getDatabase();
      // Inspect invite document in MongoDB
      const inviteDoc = await db.collection('invites').findOne({ teamId: new ObjectId(teamId) });
      expect(inviteDoc).not.toBeNull();
      // Plain text token MUST NOT exist in DB
      expect((inviteDoc as any).token).toBeUndefined();
      // SHA-256 hash must be 64-char hex string
      expect(inviteDoc?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects invite replay with 409 INVITE_USED', async () => {
      const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
      const leader = await createTestUser();
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
      const { sessionCookie: cookie1, csrfToken: csrf1 } = await createTestSession(user1._id);
      const { sessionCookie: cookie2, csrfToken: csrf2 } = await createTestSession(user2._id);

      const teamRes = await request(app)
        .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({ name: 'Replay Test Team', minSize: 2, maxSize: 5 });
      const teamId = teamRes.body.data.id;

      const invRes = await request(app)
        .post(`/api/v1/teams/${teamId}/invites`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf)
        .send({});
      const token = invRes.body.data.token;

      // First user redeems successfully
      const firstRedeem = await request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', cookie1)
        .set('X-CSRF-Token', csrf1)
        .send({ token });
      expect(firstRedeem.status).toBe(200);

      // Second user attempts to replay the same token
      const secondRedeem = await request(app)
        .post('/api/v1/invites/redeem')
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', csrf2)
        .send({ token });
      expect(secondRedeem.status).toBe(409);
      expect(secondRedeem.body.error.code).toBe('INVITE_USED');
    });
  });

  describe('5. Password Security & Argon2id Hash Parameter Verification', () => {
    it('verifies Argon2id parameters (m=19456, t=2, p=4) and prevents credential leaks in responses', async () => {
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'security.check@example.com',
          password: 'SuperSecretPassword123!',
          displayName: 'Sec Check'
        });

      expect(regRes.status).toBe(201);
      // Ensure password or hash is NEVER returned in response
      expect(regRes.body.data.password).toBeUndefined();
      expect(regRes.body.data.passwordHash).toBeUndefined();

      const db = getDatabase();
      const userDoc = await db.collection('users').findOne({ emailNormalized: 'security.check@example.com' });
      expect(userDoc).not.toBeNull();
      // Hash format: $argon2id$v=19$m=19456,t=2,p=4$...
      expect(userDoc?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=4\$/);
    });
  });

  describe('6. Rate Limiting Defense', () => {
    it('triggers 429 RATE_LIMITED when login attempts exceed limit', async () => {
      const email = 'ratelimit.target@example.com';

      // Send 21 login requests with x-test-rate-limit header
      const responses: request.Response[] = [];
      for (let i = 0; i < 22; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({
            email,
            password: 'WrongPasswordEveryTime123!'
          });
        responses.push(res);
      }

      // First 20 requests get 401 INVALID_CREDENTIALS
      for (let i = 0; i < 20; i++) {
        expect(responses[i].status).toBe(401);
      }

      // 21st and 22nd request must be rate limited with 429
      expect(responses[20].status).toBe(429);
      expect(responses[20].body.error.code).toBe('RATE_LIMITED');
      expect(responses[21].status).toBe(429);
    });
  });

  describe('7. Information Disclosure & Error Sanitization', () => {
    it('never leaks stack traces, paths, or database internals in 4xx/5xx responses', async () => {
      // Send malformed JSON body
      const badJsonRes = await request(app)
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect([400, 422]).toContain(badJsonRes.status);
      expect(badJsonRes.body.error).toBeDefined();
      expect(badJsonRes.body.error.stack).toBeUndefined();

      // Send invalid ObjectId in path
      const user = await createTestUser();
      const { sessionCookie } = await createTestSession(user._id);

      const invalidIdRes = await request(app)
        .get('/api/v1/teams/not-a-valid-objectid')
        .set('Cookie', sessionCookie);

      expect([400, 404, 422]).toContain(invalidIdRes.status);
      expect(invalidIdRes.body.error.stack).toBeUndefined();
      expect(JSON.stringify(invalidIdRes.body)).not.toContain('/Users/');
      expect(JSON.stringify(invalidIdRes.body)).not.toContain('mongodb://');
    });
  });
});
