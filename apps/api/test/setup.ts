import { beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { ObjectId } from 'mongodb';
import { connectToDatabase, closeDatabase, getDatabase } from '../src/db/client.js';
import { initializeIndexes } from '../src/db/indexes.js';
import { hashToken } from '../src/middleware/session.js';
import { env } from '../src/config/env.js';

export async function clearTestCollections(): Promise<void> {
  const db = getDatabase();
  const collections = [
    'users',
    'sessions',
    'hackathons',
    'teams',
    'memberships',
    'join_requests',
    'invites',
    'idempotency_keys',
    'audit_events',
    'realtime_events',
    'smoke_test_col_a',
    'smoke_test_col_b'
  ];
  for (const name of collections) {
    try {
      await db.collection(name).deleteMany({});
    } catch {
      // Collection may not exist yet
    }
  }
}

export async function createTestUser(params?: {
  email?: string;
  displayName?: string;
  password?: string;
}): Promise<{ _id: ObjectId; emailNormalized: string; displayName: string }> {
  const db = getDatabase();
  const email = params?.email || `user-${crypto.randomUUID()}@example.com`;
  const emailNormalized = email.toLowerCase().trim();
  const displayName = params?.displayName || `User ${emailNormalized.slice(0, 8)}`;
  const password = params?.password || 'Password123456!';

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const now = new Date();

  const res = await db.collection('users').insertOne({
    emailNormalized,
    passwordHash,
    displayName,
    skills: ['typescript', 'node.js', 'react'],
    discoverable: true,
    createdAt: now,
    updatedAt: now
  });

  return { _id: res.insertedId, emailNormalized, displayName };
}

export async function createTestSession(
  userId: ObjectId
): Promise<{ sessionCookie: string; csrfToken: string }> {
  const db = getDatabase();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const csrfToken = crypto.randomBytes(32).toString('hex');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.collection('sessions').insertOne({
    userId,
    tokenHash,
    csrfToken,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null
  });

  return {
    sessionCookie: `${env.SESSION_COOKIE_NAME}=${rawToken}`,
    csrfToken
  };
}

export async function createTestHackathon(params?: {
  slug?: string;
  title?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
}): Promise<{ _id: ObjectId; slug: string; title: string; minTeamSize: number; maxTeamSize: number }> {
  const db = getDatabase();
  const slug = params?.slug || `hackathon-${crypto.randomUUID().slice(0, 8)}`;
  const title = params?.title || `Hackathon ${slug}`;
  const minTeamSize = params?.minTeamSize ?? 2;
  const maxTeamSize = params?.maxTeamSize ?? 5;

  const res = await db.collection('hackathons').insertOne({
    slug,
    title,
    minTeamSize,
    maxTeamSize,
    active: true,
    createdAt: new Date()
  });

  return { _id: res.insertedId, slug, title, minTeamSize, maxTeamSize };
}

beforeAll(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crewgrid_test?replicaSet=rs0&directConnection=true';
  const dbName = process.env.MONGODB_DB || 'crewgrid_test';

  const { db } = await connectToDatabase(uri, dbName);
  await initializeIndexes(db);
  await clearTestCollections();
});

afterAll(async () => {
  await closeDatabase();
});

