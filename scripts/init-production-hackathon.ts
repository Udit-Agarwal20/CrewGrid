import { MongoClient, Db } from 'mongodb';

export async function ensureDefaultHackathon(db: Db): Promise<{ created: boolean; slug: string }> {
  const existing = await db.collection('hackathons').findOne({ slug: 'hack4hack-2026' });
  if (existing) {
    console.log(`Hackathon 'hack4hack-2026' already exists (ID: ${existing._id.toHexString()}). No changes needed.`);
    return { created: false, slug: 'hack4hack-2026' };
  }

  const now = new Date();
  const hackathon = {
    slug: 'hack4hack-2026',
    title: 'Hack4Hack Crew Hiring Challenge 2026',
    minTeamSize: 2,
    maxTeamSize: 5,
    active: true,
    createdAt: now,
    startsAt: now,
    endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  };

  const res = await db.collection('hackathons').insertOne(hackathon);
  console.log(`✓ Successfully initialized default hackathon 'hack4hack-2026' (ID: ${res.insertedId.toHexString()})`);
  return { created: true, slug: 'hack4hack-2026' };
}

async function main() {
  const hasConfirm = process.argv.includes('--confirm');
  if (!hasConfirm) {
    console.error('Error: Production initialization requires explicit --confirm flag.');
    console.error('Usage: tsx scripts/init-production-hackathon.ts --confirm');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || (mongoUri.includes('/') ? mongoUri.split('/').pop()?.split('?')[0] : undefined);
  console.log(`Connecting to MongoDB... (Target DB: ${dbName || 'default from URI'})`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    await ensureDefaultHackathon(db);
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Initialization error:', err);
    process.exit(1);
  });
}
