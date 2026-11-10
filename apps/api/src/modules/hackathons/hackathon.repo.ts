import { ObjectId } from 'mongodb';
import { getDatabase } from '../../db/client.js';

export interface HackathonDocument {
  _id: ObjectId;
  slug: string;
  title: string;
  minTeamSize: number;
  maxTeamSize: number;
  startsAt?: Date;
  endsAt?: Date;
  active: boolean;
  createdAt: Date;
}

export class HackathonRepo {
  private get collection() {
    return getDatabase().collection<HackathonDocument>('hackathons');
  }

  async findById(id: ObjectId): Promise<HackathonDocument | null> {
    return this.collection.findOne({ _id: id });
  }

  async findBySlug(slug: string): Promise<HackathonDocument | null> {
    return this.collection.findOne({ slug });
  }

  async listActive(): Promise<HackathonDocument[]> {
    return this.collection.find({ active: true }).toArray();
  }

  async createHackathon(doc: Omit<HackathonDocument, '_id'>): Promise<HackathonDocument> {
    const fullDoc: HackathonDocument = {
      ...doc,
      _id: new ObjectId()
    };
    await this.collection.insertOne(fullDoc);
    return fullDoc;
  }
}

export const hackathonRepo = new HackathonRepo();

