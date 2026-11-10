import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';

export interface MembershipDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  teamId: ObjectId;
  userId: ObjectId;
  joinedAt: Date;
}

export class MembershipRepo {
  private get collection() {
    return getDatabase().collection<MembershipDocument>('memberships');
  }

  async findActiveMembership(
    hackathonId: ObjectId,
    userId: ObjectId,
    session?: ClientSession
  ): Promise<MembershipDocument | null> {
    return this.collection.findOne({ hackathonId, userId }, { session });
  }

  async findTeamMembers(teamId: ObjectId, session?: ClientSession): Promise<MembershipDocument[]> {
    return this.collection
      .find({ teamId }, { session })
      .sort({ joinedAt: 1, _id: 1 })
      .toArray();
  }

  async insertMembership(
    doc: Omit<MembershipDocument, '_id'>,
    session: ClientSession
  ): Promise<MembershipDocument> {
    const fullDoc: MembershipDocument = {
      ...doc,
      _id: new ObjectId()
    };
    await this.collection.insertOne(fullDoc, { session });
    return fullDoc;
  }

  async deleteMembership(
    hackathonId: ObjectId,
    teamId: ObjectId,
    userId: ObjectId,
    session: ClientSession
  ): Promise<boolean> {
    const res = await this.collection.deleteOne({ hackathonId, teamId, userId }, { session });
    return res.deletedCount === 1;
  }

  async findOldestRemainingMember(
    teamId: ObjectId,
    excludeUserId: ObjectId,
    session: ClientSession
  ): Promise<MembershipDocument | null> {
    return this.collection.findOne(
      { teamId, userId: { $ne: excludeUserId } },
      {
        sort: { joinedAt: 1, _id: 1 },
        session
      }
    );
  }
}

export const membershipRepo = new MembershipRepo();

