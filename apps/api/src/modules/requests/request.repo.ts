import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';
import { JoinRequestStatus } from '@crewgrid/contracts';

export interface JoinRequestDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  teamId: ObjectId;
  applicantId: ObjectId;
  status: JoinRequestStatus;
  message: string;
  resolvedBy?: ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
}

export class RequestRepo {
  private get collection() {
    return getDatabase().collection<JoinRequestDocument>('join_requests');
  }

  async findById(id: ObjectId, session?: ClientSession): Promise<JoinRequestDocument | null> {
    return this.collection.findOne({ _id: id }, { session });
  }

  async findPending(
    teamId: ObjectId,
    applicantId: ObjectId,
    session?: ClientSession
  ): Promise<JoinRequestDocument | null> {
    return this.collection.findOne({ teamId, applicantId, status: 'pending' }, { session });
  }

  async createRequest(
    doc: Omit<JoinRequestDocument, '_id'>,
    session?: ClientSession
  ): Promise<JoinRequestDocument> {
    const fullDoc: JoinRequestDocument = {
      ...doc,
      _id: new ObjectId()
    };
    await this.collection.insertOne(fullDoc, { session });
    return fullDoc;
  }

  async resolveRequest(
    id: ObjectId,
    status: JoinRequestStatus,
    resolvedBy: ObjectId,
    session: ClientSession
  ): Promise<boolean> {
    const res = await this.collection.updateOne(
      { _id: id, status: 'pending' },
      {
        $set: {
          status,
          resolvedBy,
          resolvedAt: new Date()
        }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async cancelRequest(id: ObjectId, applicantId: ObjectId, session?: ClientSession): Promise<boolean> {
    const res = await this.collection.updateOne(
      { _id: id, applicantId, status: 'pending' },
      {
        $set: {
          status: 'canceled',
          resolvedAt: new Date()
        }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async invalidatePendingRequestsForUser(
    hackathonId: ObjectId,
    applicantId: ObjectId,
    session: ClientSession
  ): Promise<number> {
    const res = await this.collection.updateMany(
      { hackathonId, applicantId, status: 'pending' },
      {
        $set: {
          status: 'invalidated',
          resolvedAt: new Date()
        }
      },
      { session }
    );
    return res.modifiedCount;
  }

  async listByTeam(
    teamId: ObjectId,
    status?: JoinRequestStatus,
    limit: number = 20,
    cursorDate?: Date
  ): Promise<JoinRequestDocument[]> {
    const query: any = { teamId };
    if (status) {
      query.status = status;
    }
    if (cursorDate) {
      query.createdAt = { $lt: cursorDate };
    }

    return this.collection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  }

  async listByApplicant(
    applicantId: ObjectId,
    limit: number = 20,
    cursorDate?: Date
  ): Promise<JoinRequestDocument[]> {
    const query: any = { applicantId };
    if (cursorDate) {
      query.createdAt = { $lt: cursorDate };
    }

    return this.collection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
  }
}

export const requestRepo = new RequestRepo();

