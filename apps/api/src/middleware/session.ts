import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db/client.js';
import { env } from '../config/env.js';
import { AppError } from '@crewgrid/contracts';

export interface UserDocument {
  _id: ObjectId;
  emailNormalized: string;
  passwordHash: string;
  displayName: string;
  handleNormalized?: string | null;
  bio?: string;
  skills: string[];
  timezone?: string;
  preferredHours?: {
    startLocal: string;
    endLocal: string;
    days?: number[];
  };
  discoverable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDocument {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument | null;
      sessionRecord?: SessionDocument | null;
    }
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = null;
  req.sessionRecord = null;

  const rawCookie = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!rawCookie || typeof rawCookie !== 'string') {
    return next();
  }

  try {
    const db = getDatabase();
    const tokenHash = hashToken(rawCookie);
    const now = new Date();

    const session = await db.collection<SessionDocument>('sessions').findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: now }
    });

    if (!session) {
      return next();
    }

    const user = await db.collection<UserDocument>('users').findOne({
      _id: session.userId
    });

    if (!user) {
      return next();
    }

    req.sessionRecord = session;
    req.user = user;

    // Update lastSeenAt asynchronously without blocking request
    db.collection('sessions')
      .updateOne({ _id: session._id }, { $set: { lastSeenAt: now } })
      .catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || !req.sessionRecord) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
  }
  next();
}

