import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function prepareBenchmarkSessions() {
  const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/crewgrid_bench?replicaSet=rs0&directConnection=true';
  const targetDb = process.env.MONGODB_DB || 'crewgrid_bench';

  console.log(`Preparing 100 authenticated sessions in ${targetDb}...`);
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(targetDb);

  try {
    const hackathon = await db.collection('hackathons').findOne({ slug: 'hack4hack-scale-2026' });
    if (!hackathon) {
      throw new Error('Hackathon hack4hack-scale-2026 not found! Run pnpm seed:scale first.');
    }

    const users = await db.collection('users').find({}).limit(100).toArray();
    if (users.length < 100) {
      throw new Error(`Expected at least 100 users, found ${users.length}. Run pnpm seed:scale first.`);
    }

    const sessionDocs: any[] = [];
    const sessionsOutput: { userId: string; token: string; csrfToken: string }[] = [];

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const user of users) {
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashToken(rawToken);
      const csrfToken = crypto.randomBytes(32).toString('hex');

      sessionDocs.push({
        _id: new ObjectId(),
        userId: user._id,
        tokenHash,
        csrfToken,
        expiresAt,
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null
      });

      sessionsOutput.push({
        userId: user._id.toHexString(),
        token: rawToken,
        csrfToken
      });
    }

    // Insert sessions
    await db.collection('sessions').insertMany(sessionDocs);
    console.log(`✓ Inserted 100 sessions into '${targetDb}'`);

    const outputData = {
      hackathonId: hackathon._id.toHexString(),
      sessions: sessionsOutput
    };

    const outPath = path.resolve(process.cwd(), 'benchmarks/sessions.json');
    fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2));
    console.log(`✓ Wrote sessions to ${outPath}`);

    return outputData;
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareBenchmarkSessions().catch((err) => {
    console.error('Failed to prepare benchmark sessions:', err);
    process.exit(1);
  });
}

