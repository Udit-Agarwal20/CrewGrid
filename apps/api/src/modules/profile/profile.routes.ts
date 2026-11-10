import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, UserDocument } from '../../middleware/session.js';
import { validateRequest } from '../../middleware/validation.js';
import { getDatabase } from '../../db/client.js';
import { ProfileUpdateSchema, ProfileUpdateInput, SuccessEnvelope, AppError, PublicUser } from '@crewgrid/contracts';

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toHexString(),
    displayName: user.displayName,
    handle: user.handleNormalized ?? null,
    bio: user.bio,
    skills: user.skills ?? [],
    timezone: user.timezone,
    preferredHours: user.preferredHours,
    discoverable: user.discoverable ?? false
  };
}

export function createProfileRouter(): Router {
  const router = Router();

  // A-06: GET /api/v1/profile
  router.get('/', requireAuth, async (req: Request, res: Response) => {
    const user = toPublicUser(req.user!);
    const response: SuccessEnvelope<typeof user> = {
      data: user,
      meta: { requestId: req.requestId }
    };
    res.status(200).json(response);
  });

  // A-07: PATCH /api/v1/profile
  router.patch(
    '/',
    requireAuth,
    validateRequest({ body: ProfileUpdateSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const db = getDatabase();
        const input: ProfileUpdateInput = req.body;
        const setFields: Partial<UserDocument> & { updatedAt: Date } = {
          updatedAt: new Date()
        };

        if (input.displayName !== undefined) {
          setFields.displayName = input.displayName;
        }

        if (input.handle !== undefined) {
          const handleNormalized = input.handle.toLowerCase().trim();
          const existing = await db.collection<UserDocument>('users').findOne({
            handleNormalized,
            _id: { $ne: req.user!._id }
          });
          if (existing) {
            throw new AppError(409, 'VALIDATION_FAILED', 'Handle already taken', {
              handle: 'Handle already in use'
            });
          }
          setFields.handleNormalized = handleNormalized;
        }

        if (input.bio !== undefined) {
          setFields.bio = input.bio;
        }

        if (input.skills !== undefined) {
          setFields.skills = input.skills;
        }

        if (input.timezone !== undefined) {
          setFields.timezone = input.timezone;
        }

        if (input.preferredHours !== undefined) {
          setFields.preferredHours = input.preferredHours;
        }

        if (input.discoverable !== undefined) {
          setFields.discoverable = input.discoverable;
        }

        const result = await db.collection<UserDocument>('users').findOneAndUpdate(
          { _id: req.user!._id },
          { $set: setFields },
          { returnDocument: 'after' }
        );

        if (!result) {
          throw new AppError(404, 'VALIDATION_FAILED', 'User not found');
        }

        const user = toPublicUser(result);
        const response: SuccessEnvelope<typeof user> = {
          data: user,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

