import { MongoClient, ObjectId } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crewgrid_smoke?replicaSet=rs0&directConnection=true';
  console.log(`Connecting to MongoDB replica set at: ${uri}`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();

  try {
    const admin = client.db('admin');
    const rsStatus = await admin.command({ replSetGetStatus: 1 });
    console.log(`✓ Replica set name: ${rsStatus.set}`);
    console.log(`✓ Primary member: ${rsStatus.members.find((m: any) => m.state === 1)?.name}`);

    const db = client.db('crewgrid_smoke');
    const colA = db.collection('smoke_col_a');
    const colB = db.collection('smoke_col_b');

    await colA.deleteMany({});
    await colB.deleteMany({});

    const session = client.startSession();
    const docId = new ObjectId();

    console.log('1. Testing transaction rollback on abort...');
    try {
      await session.withTransaction(async () => {
        await colA.insertOne({ _id: docId, test: 'rollback' }, { session });
        await colB.insertOne({ _id: docId, test: 'rollback' }, { session });
        throw new Error('FORCE_ABORT');
      });
    } catch (e: any) {
      if (e.message !== 'FORCE_ABORT') throw e;
    }

    const docAAfterAbort = await colA.findOne({ _id: docId });
    const docBAfterAbort = await colB.findOne({ _id: docId });
    if (docAAfterAbort !== null || docBAfterAbort !== null) {
      throw new Error('FAILED: Transaction abort did not roll back writes!');
    }
    console.log('✓ Transaction rollback successfully verified (0 uncommitted documents leaked).');

    console.log('2. Testing transaction commit persistence...');
    await session.withTransaction(async () => {
      await colA.insertOne({ _id: docId, test: 'committed' }, { session });
      await colB.insertOne({ _id: docId, test: 'committed' }, { session });
    });

    const docAAfterCommit = await colA.findOne({ _id: docId });
    const docBAfterCommit = await colB.findOne({ _id: docId });
    if (!docAAfterCommit || !docBAfterCommit) {
      throw new Error('FAILED: Transaction commit was not persisted!');
    }
    console.log('✓ Transaction commit successfully persisted both documents.');

    await session.endSession();
    await colA.deleteMany({});
    await colB.deleteMany({});

    console.log('=== TRANSACTION SMOKE TEST PASSED: Replica set transactions fully operational! ===');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('TRANSACTION SMOKE TEST FAILED:', err);
  process.exit(1);
});

