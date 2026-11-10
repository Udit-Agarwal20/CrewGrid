import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDatabase, getMongoClient } from '../src/db/client.js';
import { withDomainTransaction } from '../src/db/transaction.js';
import { clearTestCollections } from './setup.js';

describe('MongoDB Replica Set Transaction Smoke Test', () => {
  beforeEach(async () => {
    await clearTestCollections();
  });

  it('proves multi-document transaction abort completely rolls back all uncommitted writes', async () => {
    const db = getDatabase();
    const colA = db.collection('smoke_test_col_a');
    const colB = db.collection('smoke_test_col_b');

    const testId = new ObjectId();

    let errorThrown = false;
    try {
      await withDomainTransaction(async ({ session }) => {
        await colA.insertOne({ _id: testId, name: 'Rollback A' }, { session });
        await colB.insertOne({ _id: testId, name: 'Rollback B' }, { session });

        // Verify writes ARE visible inside the active transaction session
        const insideDocA = await colA.findOne({ _id: testId }, { session });
        const insideDocB = await colB.findOne({ _id: testId }, { session });
        expect(insideDocA).not.toBeNull();
        expect(insideDocB).not.toBeNull();

        // Verify writes are NOT visible outside the session (snapshot/read committed isolation)
        const outsideDocA = await colA.findOne({ _id: testId });
        const outsideDocB = await colB.findOne({ _id: testId });
        expect(outsideDocA).toBeNull();
        expect(outsideDocB).toBeNull();

        // Deliberately abort
        throw new Error('DELIBERATE_TEST_ABORT');
      });
    } catch (err: any) {
      if (err.message === 'DELIBERATE_TEST_ABORT') {
        errorThrown = true;
      } else {
        throw err;
      }
    }

    expect(errorThrown).toBe(true);

    // After abort, both documents must not exist in database
    const finalDocA = await colA.findOne({ _id: testId });
    const finalDocB = await colB.findOne({ _id: testId });
    expect(finalDocA).toBeNull();
    expect(finalDocB).toBeNull();
  });

  it('proves multi-document transaction commit atomically persists all writes', async () => {
    const db = getDatabase();
    const colA = db.collection('smoke_test_col_a');
    const colB = db.collection('smoke_test_col_b');

    const testId = new ObjectId();

    const commitResult = await withDomainTransaction(async ({ session }) => {
      await colA.insertOne({ _id: testId, name: 'Committed A' }, { session });
      await colB.insertOne({ _id: testId, name: 'Committed B' }, { session });
      return { status: 'COMMITTED_SUCCESS' };
    });

    expect(commitResult.status).toBe('COMMITTED_SUCCESS');

    // Both documents must be permanently persisted
    const docA = await colA.findOne({ _id: testId });
    const docB = await colB.findOne({ _id: testId });
    expect(docA).not.toBeNull();
    expect(docA?.name).toBe('Committed A');
    expect(docB).not.toBeNull();
    expect(docB?.name).toBe('Committed B');
  });

  it('proves replica set status is healthy and primary is elected', async () => {
    const client = getMongoClient();
    const adminDb = client.db('admin');
    const status = await adminDb.command({ replSetGetStatus: 1 });

    expect(status.ok).toBe(1);
    expect(status.set).toBe('rs0');
    expect(status.myState).toBe(1); // 1 = PRIMARY
  });
});

