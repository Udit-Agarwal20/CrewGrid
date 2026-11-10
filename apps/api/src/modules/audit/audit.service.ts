import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';
import { AuditAction } from '@crewgrid/contracts';

export interface AuditEventDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  teamId: ObjectId;
  actorId: ObjectId;
  action: AuditAction;
  subjectId?: ObjectId | null;
  changes?: Record<string, unknown> | null;
  occurredAt: Date;
  requestId: string;
}

export class AuditService {
  private get collection() {
    return getDatabase().collection<AuditEventDocument>('audit_events');
  }

  async recordAuditEvent(
    event: {
      hackathonId: ObjectId;
      teamId: ObjectId;
      actorId: ObjectId;
      action: AuditAction;
      subjectId?: ObjectId | null;
      changes?: Record<string, unknown> | null;
      occurredAt?: Date;
      requestId: string;
    },
    session?: ClientSession
  ): Promise<AuditEventDocument> {
    const doc: AuditEventDocument = {
      _id: new ObjectId(),
      hackathonId: event.hackathonId,
      teamId: event.teamId,
      actorId: event.actorId,
      action: event.action,
      subjectId: event.subjectId ?? null,
      changes: event.changes ?? null,
      occurredAt: event.occurredAt ?? new Date(),
      requestId: event.requestId
    };

    await this.collection.insertOne(doc, { session });
    return doc;
  }

  async getTeamAuditEvents(
    teamId: ObjectId,
    limit: number = 20,
    beforeDate?: Date
  ): Promise<AuditEventDocument[]> {
    const query: any = { teamId };
    if (beforeDate) {
      query.occurredAt = { $lt: beforeDate };
    }

    return this.collection
      .find(query)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  }
}

export const auditService = new AuditService();

