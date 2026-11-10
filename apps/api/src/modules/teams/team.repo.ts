import { ObjectId, ClientSession } from 'mongodb';
import { getDatabase } from '../../db/client.js';

export interface TeamDocument {
  _id: ObjectId;
  hackathonId: ObjectId;
  name: string;
  description: string;
  requiredSkills: string[];
  leaderId: ObjectId;
  minSize: number;
  maxSize: number;
  memberCount: number;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TeamRepo {
  private get collection() {
    return getDatabase().collection<TeamDocument>('teams');
  }

  async findById(id: ObjectId, session?: ClientSession): Promise<TeamDocument | null> {
    return this.collection.findOne({ _id: id }, { session });
  }

  async findActiveById(id: ObjectId, session?: ClientSession): Promise<TeamDocument | null> {
    return this.collection.findOne({ _id: id, deletedAt: null }, { session });
  }

  async createTeam(doc: Omit<TeamDocument, '_id'>, session?: ClientSession): Promise<TeamDocument> {
    const fullDoc: TeamDocument = {
      ...doc,
      _id: new ObjectId()
    };
    await this.collection.insertOne(fullDoc, { session });
    return fullDoc;
  }

  async guardedIncrementMemberCount(teamId: ObjectId, session: ClientSession): Promise<boolean> {
    const res = await this.collection.updateOne(
      {
        _id: teamId,
        deletedAt: null,
        $expr: { $lt: ['$memberCount', '$maxSize'] }
      },
      {
        $inc: { memberCount: 1, version: 1 },
        $set: { updatedAt: new Date() }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async decrementMemberCount(
    teamId: ObjectId,
    newLeaderId: ObjectId | undefined,
    session: ClientSession
  ): Promise<boolean> {
    const update: any = {
      $inc: { memberCount: -1, version: 1 },
      $set: { updatedAt: new Date() }
    };
    if (newLeaderId) {
      update.$set.leaderId = newLeaderId;
    }

    const res = await this.collection.updateOne(
      {
        _id: teamId,
        deletedAt: null,
        memberCount: { $gt: 0 }
      },
      update,
      { session }
    );
    return res.modifiedCount === 1;
  }

  async softDeleteTeam(teamId: ObjectId, session: ClientSession): Promise<boolean> {
    const res = await this.collection.updateOne(
      { _id: teamId, deletedAt: null },
      {
        $set: { deletedAt: new Date(), memberCount: 0, updatedAt: new Date() },
        $inc: { version: 1 }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async transferLeadership(
    teamId: ObjectId,
    newLeaderId: ObjectId,
    session: ClientSession
  ): Promise<boolean> {
    const res = await this.collection.updateOne(
      { _id: teamId, deletedAt: null },
      {
        $set: { leaderId: newLeaderId, updatedAt: new Date() },
        $inc: { version: 1 }
      },
      { session }
    );
    return res.modifiedCount === 1;
  }

  async updateTeamMetadata(
    teamId: ObjectId,
    leaderId: ObjectId,
    updates: {
      name?: string;
      description?: string;
      requiredSkills?: string[];
      minSize?: number;
      maxSize?: number;
    },
    session: ClientSession
  ): Promise<{ success: boolean; reason?: 'NOT_FOUND' | 'SIZE_CONFLICT' }> {
    const current = await this.collection.findOne({ _id: teamId, deletedAt: null, leaderId }, { session });
    if (!current) {
      return { success: false, reason: 'NOT_FOUND' };
    }

    if (updates.maxSize !== undefined && updates.maxSize < current.memberCount) {
      return { success: false, reason: 'SIZE_CONFLICT' };
    }

    const setObj: any = { updatedAt: new Date() };
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.requiredSkills !== undefined) setObj.requiredSkills = updates.requiredSkills;
    if (updates.minSize !== undefined) setObj.minSize = updates.minSize;
    if (updates.maxSize !== undefined) setObj.maxSize = updates.maxSize;

    const res = await this.collection.updateOne(
      {
        _id: teamId,
        deletedAt: null,
        leaderId,
        ...(updates.maxSize !== undefined ? { memberCount: { $lte: updates.maxSize } } : {})
      },
      {
        $set: setObj,
        $inc: { version: 1 }
      },
      { session }
    );

    if (res.modifiedCount !== 1) {
      return { success: false, reason: 'SIZE_CONFLICT' };
    }

    return { success: true };
  }

  async listTeamsForBoard(params: {
    hackathonId: ObjectId;
    search?: string;
    skill?: string;
    onlyOpen?: boolean;
    limit: number;
    cursor?: { updatedAt: Date; id: ObjectId };
  }): Promise<TeamDocument[]> {
    const filter: any = {
      hackathonId: params.hackathonId,
      deletedAt: null
    };

    if (params.onlyOpen) {
      filter.$expr = { $lt: ['$memberCount', '$maxSize'] };
    }

    if (params.search) {
      const escaped = params.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: escaped, $options: 'i' };
    }

    if (params.skill) {
      const escapedSkill = params.skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.requiredSkills = { $elemMatch: { $regex: `^${escapedSkill}$`, $options: 'i' } };
    }

    if (params.cursor) {
      filter.$or = [
        { updatedAt: { $lt: params.cursor.updatedAt } },
        { updatedAt: params.cursor.updatedAt, _id: { $lt: params.cursor.id } }
      ];
    }

    return this.collection
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(params.limit)
      .toArray();
  }
}

export const teamRepo = new TeamRepo();

