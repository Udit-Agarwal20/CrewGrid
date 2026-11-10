import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { clearTestCollections } from './setup.js';
import { getDatabase } from '../src/db/client.js';
import { hashToken } from '../src/middleware/session.js';
import { env } from '../src/config/env.js';

describe('Auth & Foundation API Integration Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
  });

  describe('Health and Readiness Probes', () => {
    it('GET /health returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /ready returns 200 with database status', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.database).toBe('connected');
    });

    it('GET /api/v1/health returns 200 versioned alias', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /api/v1/ready returns 200 versioned alias', async () => {
      const res = await request(app).get('/api/v1/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('T-001: User Registration', () => {
    it('successfully registers a new user with normalized email and Argon2id hash', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: '  Alice@Example.Com  ',
          password: 'CorrectHorseBatteryStaple123!',
          displayName: 'Alice Developer'
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toMatch(/^[0-9a-fA-F]{24}$/);
      expect(res.body.data.displayName).toBe('Alice Developer');
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.meta.requestId).toBeDefined();

      // Verify in DB directly
      const db = getDatabase();
      const user = await db.collection('users').findOne({ emailNormalized: 'alice@example.com' });
      expect(user).not.toBeNull();
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('rejects short passwords (< 12 chars) with 422 VALIDATION_FAILED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'bob@example.com',
          password: 'short',
          displayName: 'Bob'
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields.password).toBeDefined();
    });
  });

  describe('T-002: Duplicate Email Conflict', () => {
    it('rejects duplicate registration attempts with 409 conflict and creates no second record', async () => {
      // First registration
      const firstRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123456789!',
          displayName: 'First User'
        });
      expect(firstRes.status).toBe(201);

      // Duplicate registration attempt
      const dupRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'Duplicate@Example.Com',
          password: 'AnotherPassword123456789!',
          displayName: 'Second User'
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('VALIDATION_FAILED');

      const db = getDatabase();
      const count = await db.collection('users').countDocuments({ emailNormalized: 'duplicate@example.com' });
      expect(count).toBe(1);
    });
  });

  describe('T-003: Login Authentication Failure', () => {
    it('returns generic 401 INVALID_CREDENTIALS for wrong password without setting session cookie', async () => {
      // Register user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'carol@example.com',
          password: 'CorrectPassword123!',
          displayName: 'Carol'
        });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'carol@example.com',
          password: 'WrongPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns generic 401 INVALID_CREDENTIALS for non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('T-004: Session Lifecycle (Login -> /auth/me -> Logout)', () => {
    it('logs in, receives HttpOnly cookie + CSRF token, accesses /auth/me, and revokes session on logout', async () => {
      // 1. Register
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'dan@example.com',
          password: 'DanPassword12345!',
          displayName: 'Dan Admin'
        });

      // 2. Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dan@example.com',
          password: 'DanPassword12345!'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.displayName).toBe('Dan Admin');
      expect(loginRes.body.data.csrfToken).toBeDefined();

      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as unknown as string[]).find((c: string) =>
        c.startsWith(`${env.SESSION_COOKIE_NAME}=`)
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');

      const csrfToken = loginRes.body.data.csrfToken;

      // 3. GET /auth/me with cookie
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie!);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.displayName).toBe('Dan Admin');
      expect(meRes.body.data.email).toBeUndefined();

      // 4. GET /auth/csrf
      const csrfRes = await request(app)
        .get('/api/v1/auth/csrf')
        .set('Cookie', sessionCookie!);

      expect(csrfRes.status).toBe(200);
      expect(csrfRes.body.data.csrfToken).toBe(csrfToken);

      // 5. POST /auth/logout with CSRF header and cookie
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie!)
        .set('X-CSRF-Token', csrfToken);

      expect(logoutRes.status).toBe(204);

      // 6. Accessing /auth/me after logout must be rejected with 401
      const meAfterLogout = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie!);

      expect(meAfterLogout.status).toBe(401);
      expect(meAfterLogout.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('T-005: Expired Session Cookie Rejection', () => {
    it('rejects an expired session token with 401 UNAUTHENTICATED even before MongoDB TTL index cleans it', async () => {
      // Directly insert an expired session in MongoDB
      const db = getDatabase();
      const testUser = await db.collection('users').insertOne({
        emailNormalized: 'expired@example.com',
        passwordHash: 'dummy',
        displayName: 'Expired Tester',
        skills: [],
        discoverable: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const rawToken = 'test-expired-token-1234567890';
      const tokenHash = hashToken(rawToken);

      // Expired 1 hour ago
      const pastDate = new Date(Date.now() - 3600 * 1000);

      await db.collection('sessions').insertOne({
        userId: testUser.insertedId,
        tokenHash,
        csrfToken: 'test-csrf',
        expiresAt: pastDate,
        createdAt: new Date(Date.now() - 7200 * 1000),
        lastSeenAt: pastDate,
        revokedAt: null
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `${env.SESSION_COOKIE_NAME}=${rawToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('T-006: CSRF Protection on Mutating Requests', () => {
    it('rejects an authenticated POST request with 403 CSRF_FAILED when X-CSRF-Token is omitted or wrong', async () => {
      // Register & Login
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'csrf-victim@example.com',
          password: 'Password123456!',
          displayName: 'CSRF Victim'
        });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'csrf-victim@example.com',
          password: 'Password123456!'
        });

      const sessionCookie = (loginRes.headers['set-cookie'] as unknown as string[]).find((c: string) =>
        c.startsWith(`${env.SESSION_COOKIE_NAME}=`)
      )!;

      // 1. Omitted X-CSRF-Token on POST /auth/logout
      const missingCsrfRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie);

      expect(missingCsrfRes.status).toBe(403);
      expect(missingCsrfRes.body.error.code).toBe('CSRF_FAILED');

      // 2. Invalid X-CSRF-Token
      const invalidCsrfRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', 'forged-attacker-token');

      expect(invalidCsrfRes.status).toBe(403);
      expect(invalidCsrfRes.body.error.code).toBe('CSRF_FAILED');
    });
  });
});

