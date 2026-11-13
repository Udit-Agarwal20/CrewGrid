import { MongoClient, ObjectId } from 'mongodb';

export const E2E_HACKATHON_ID = new ObjectId('650c00000000000000000001');

export default async function globalSetup() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crewgrid_e2e?replicaSet=rs0&directConnection=true';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('crewgrid_e2e');

  // Clean collections in isolated e2e database only
  const collections = [
    'users',
    'sessions',
    'hackathons',
    'teams',
    'memberships',
    'join_requests',
    'invites',
    'audit_events',
    'realtime_events',
    'idempotency_keys'
  ];

  for (const collName of collections) {
    try {
      await db.collection(collName).deleteMany({});
    } catch {
      // Ignore if collection does not exist yet
    }
  }

  // Seed active hackathon for e2e testing
  await db.collection('hackathons').updateOne(
    { _id: E2E_HACKATHON_ID },
    {
      $set: {
        slug: 'hack4hack-2026',
        title: 'Hack4Hack 2026',
        minTeamSize: 2,
        maxTeamSize: 3,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        active: true
      }
    },
    { upsert: true }
  );

  // Seed second active hackathon for switching tests
  await db.collection('hackathons').updateOne(
    { _id: new ObjectId('650c00000000000000000002') },
    {
      $set: {
        slug: 'ai-agents-challenge',
        title: 'AI Agents Challenge 2026',
        minTeamSize: 2,
        maxTeamSize: 4,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        active: true
      }
    },
    { upsert: true }
  );

  await client.close();
}

