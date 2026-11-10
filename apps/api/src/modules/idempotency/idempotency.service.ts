import crypto from 'node:crypto';
import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';

export interface IdempotencyRecord {
  _id: ObjectId;
  actorId: ObjectId;
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: any;
  createdAt: Date;
  expiresAt: Date;
}

export function computeRequestHash(payload: unknown, scope: string): string {
  const normalized = JSON.stringify(payload ?? {}, Object.keys((payload ?? {}) as any).sort());
  return crypto.createHash('sha256').update(`${scope}:${normalized}`).digest('hex');
}

export class IdempotencyService {
  private get collection() {
    return getDatabase().collection<IdempotencyRecord>('idempotency_keys');
  }

  async findRecord(
    actorId: ObjectId,
    scope: string,
    key: string,
    session?: ClientSession
  ): Promise<IdempotencyRecord | null> {
    return this.collection.findOne({ actorId, scope, key }, { session });
  }

  async recordSuccess(
    record: {
      actorId: ObjectId;
      scope: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: any;
    },
    session?: ClientSession
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours TTL

    await this.collection.insertOne(
      {
        _id: new ObjectId(),
        actorId: record.actorId,
        scope: record.scope,
        key: record.key,
        requestHash: record.requestHash,
        responseStatus: record.responseStatus,
        responseBody: record.responseBody,
        createdAt: now,
        expiresAt
      },
      { session }
    );
  }
}

export const idempotencyService = new IdempotencyService();
