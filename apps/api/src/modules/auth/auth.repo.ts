import { ObjectId } from 'mongodb';
import { getDatabase } from '../../db/client.js';
import { UserDocument, SessionDocument } from '../../middleware/session.js';

export class AuthRepo {
  private get users() {
    return getDatabase().collection<UserDocument>('users');
  }

  private get sessions() {
    return getDatabase().collection<SessionDocument>('sessions');
  }

  async findUserByEmail(emailNormalized: string): Promise<UserDocument | null> {
    return this.users.findOne({ emailNormalized });
  }

  async findUserById(id: ObjectId): Promise<UserDocument | null> {
    return this.users.findOne({ _id: id });
  }

  async createUser(user: Omit<UserDocument, '_id'>): Promise<UserDocument> {
    const doc = {
      ...user,
      _id: new ObjectId()
    };
    await this.users.insertOne(doc);
    return doc;
  }

  async createSession(session: Omit<SessionDocument, '_id'>): Promise<SessionDocument> {
    const doc = {
      ...session,
      _id: new ObjectId()
    };
    await this.sessions.insertOne(doc);
    return doc;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionDocument | null> {
    return this.sessions.findOne({ tokenHash, revokedAt: null });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.sessions.updateOne(
      { tokenHash },
      { $set: { revokedAt: new Date() } }
    );
  }

  async revokeAllUserSessions(userId: ObjectId): Promise<void> {
    await this.sessions.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
}

