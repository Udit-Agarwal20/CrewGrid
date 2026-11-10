import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../db/client.js';
import { RealtimeEventType, RealtimeEventScope } from '@crewgrid/contracts';

export interface OutboxEventDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  teamId?: ObjectId | null;
  userId?: ObjectId | null;
  scope: RealtimeEventScope;
  eventType: RealtimeEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

export class OutboxRepo {
  private get collection() {
    return getDatabase().collection<OutboxEventDocument>('realtime_events');
  }

  async insertEvent(
    event: {
      hackathonId: ObjectId;
      teamId?: ObjectId | null;
      userId?: ObjectId | null;
      scope: RealtimeEventScope;
      eventType: RealtimeEventType;
      payload: Record<string, unknown>;
    },
    session?: ClientSession
  ): Promise<OutboxEventDocument> {
    const now = new Date();
    // 2 hours retention window for outbox replay
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const doc: OutboxEventDocument = {
      _id: new ObjectId(),
      hackathonId: event.hackathonId,
      teamId: event.teamId ?? null,
      userId: event.userId ?? null,
      scope: event.scope,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: now,
      expiresAt
    };

    await this.collection.insertOne(doc, { session });
    return doc;
  }
}

export const outboxRepo = new OutboxRepo();

