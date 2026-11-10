import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { matchingService } from './matching.service.js';
import { requireAuth } from '../../middleware/session.js';
import { validateRequest } from '../../middleware/validation.js';
import {
  ObjectIdSchema,
  TeammatesQuerySchema,
  SuccessEnvelope
} from '@crewgrid/contracts';

const HackathonParamSchema = z.object({
  hackathonId: ObjectIdSchema
});

const TeamParamSchema = z.object({
  teamId: ObjectIdSchema
});

const toId = (param: string | string[]): ObjectId => new ObjectId(Array.isArray(param) ? param[0]! : param);

function decodeCursor(cursor?: string): { updatedAt: Date; id: ObjectId } | undefined {
  if (!cursor) return undefined;
  try {
    const str = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(str);
    if (!parsed.u || !parsed.id || !ObjectId.isValid(parsed.id)) return undefined;
    const date = new Date(parsed.u);
    if (isNaN(date.getTime())) return undefined;
    return { updatedAt: date, id: new ObjectId(parsed.id) };
  } catch {
    return undefined;
  }
}

export function createTeammatesRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-27: GET /api/v1/hackathons/:hackathonId/teammates
  router.get(
    '/',
    requireAuth,
    validateRequest({ params: HackathonParamSchema, query: TeammatesQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hackathonId = toId(req.params['hackathonId']!);
        const { skill, timezone, cursor, limit = 12 } = req.query as any;

        const cursorDecoded = decodeCursor(cursor);
        const { candidates, hasMore, nextCursor } = await matchingService.getTeammatesBoard({
          hackathonId,
          skill,
          timezone,
          cursor: cursorDecoded,
          limit
        });

        const response: SuccessEnvelope<typeof candidates> = {
          data: candidates,
          meta: {
            requestId: req.requestId,
            nextCursor,
            hasMore
          }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export function createSuggestionsRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-28: GET /api/v1/teams/:teamId/suggestions
  router.get(
    '/',
    requireAuth,
    validateRequest({ params: TeamParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const suggestions = await matchingService.getTeamSuggestions({
          teamId,
          leaderId: req.user!._id
        });

        const response: SuccessEnvelope<typeof suggestions> = {
          data: suggestions,
          meta: {
            requestId: req.requestId
          }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

