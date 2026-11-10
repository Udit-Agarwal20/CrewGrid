import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';

export interface InviteDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  teamId: ObjectId;
  createdBy: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
  usedBy: ObjectId | null;
  createdAt: Date;
}

export class InviteRepo {
  private get collection() {
    return getDatabase().collection<InviteDocument>('invites');
  }

  async findById(id: ObjectId, session?: ClientSession): Promise<InviteDocument | null> {
    return this.collection.findOne({ _id: id }, { session });
  }

  async findByTokenHash(tokenHash: string, session?: ClientSession): Promise<InviteDocument | null> {
    return this.collection.findOne({ tokenHash }, { session });
  }

  async createInvite(doc: Omit<InviteDocument, '_id'>, session?: ClientSession): Promise<InviteDocument> {
    const fullDoc: InviteDocument = {
      ...doc,
      _id: new ObjectId()
    };
    await this.collection.insertOne(fullDoc, { session });
    return fullDoc;
  }

  async conditionallyConsumeInvite(
    id: ObjectId,
    usedBy: ObjectId,
    session: ClientSession
  ): Promise<boolean> {
    const now = new Date();
    const res = await this.collection.updateOne(
      {
        _id: id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now }
      },
      {
        $set: {
          usedAt: now,
          usedBy
        }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async revokeInvite(id: ObjectId, session?: ClientSession): Promise<boolean> {
    const res = await this.collection.updateOne(
      {
        _id: id,
        revokedAt: null,
        usedAt: null
      },
      {
        $set: {
          revokedAt: new Date()
        }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async listByTeam(teamId: ObjectId): Promise<InviteDocument[]> {
    return this.collection
      .find({ teamId })
      .sort({ createdAt: -1 })
      .toArray();
  }
}

export const inviteRepo = new InviteRepo();

