import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { teamRepo } from './team.repo.js';
import { membershipRepo } from '../membership/membership.repo.js';
import { membershipService } from '../membership/membership.service.js';
import { auditService } from '../audit/audit.service.js';
import { requireAuth } from '../../middleware/session.js';
import { validateRequest } from '../../middleware/validation.js';
import {
  ObjectIdSchema,
  CreateTeamSchema,
  EditTeamSchema,
  TransferLeadershipSchema,
  TeamBoardQuerySchema,
  AppError,
  SuccessEnvelope
} from '@crewgrid/contracts';

const TeamParamsSchema = z.object({
  teamId: ObjectIdSchema
});

const HackathonParamsSchema = z.object({
  hackathonId: ObjectIdSchema
});

const RemoveMemberParamsSchema = z.object({
  teamId: ObjectIdSchema,
  userId: ObjectIdSchema
});

const toId = (param: string | string[]): ObjectId => new ObjectId(Array.isArray(param) ? param[0]! : param);

export function createTeamRouter(): Router {
  const router = Router();

  // A-11: GET /api/v1/teams/:teamId
  router.get(
    '/:teamId',
    requireAuth,
    validateRequest({ params: TeamParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const team = await teamRepo.findActiveById(teamId);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found or has been deleted');
        }

        const data = membershipService.toTeamResponse(team, req.user!._id);
        const response: SuccessEnvelope<typeof data> = {
          data,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-12: PATCH /api/v1/teams/:teamId (Leader edits team metadata/capacity)
  router.patch(
    '/:teamId',
    requireAuth,
    validateRequest({ params: TeamParamsSchema, body: EditTeamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { team, replayed } = await membershipService.editTeam({
          actorId: req.user!._id,
          teamId,
          updates: req.body,
          requestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof team> = {
          data: team,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-23: POST /api/v1/teams/:teamId/leave (Member/leader leaves team)
  router.post(
    '/:teamId/leave',
    requireAuth,
    validateRequest({ params: TeamParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { result, replayed } = await membershipService.leaveTeam({
          actorId: req.user!._id,
          teamId,
          requestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof result> = {
          data: result,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-24: DELETE /api/v1/teams/:teamId/members/:userId (Leader removes member)
  router.delete(
    '/:teamId/members/:userId',
    requireAuth,
    validateRequest({ params: RemoveMemberParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const targetUserId = toId(req.params['userId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { replayed } = await membershipService.removeMember({
          actorId: req.user!._id,
          teamId,
          targetUserId,
          requestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  // A-25: POST /api/v1/teams/:teamId/transfer-leadership (Leader transfers leadership)
  router.post(
    '/:teamId/transfer-leadership',
    requireAuth,
    validateRequest({ params: TeamParamsSchema, body: TransferLeadershipSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const newLeaderId = new ObjectId(req.body.newLeaderId);
        const idempotencyKey = req.header('idempotency-key');

        const { team, replayed } = await membershipService.transferLeadership({
          actorId: req.user!._id,
          teamId,
          newLeaderId,
          requestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof team> = {
          data: team,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-26: GET /api/v1/teams/:teamId/audit (Authorized members view team activity)
  router.get(
    '/:teamId/audit',
    requireAuth,
    validateRequest({ params: TeamParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const team = await teamRepo.findActiveById(teamId);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        }

        const isMember = await membershipRepo.findActiveMembership(team.hackathonId, req.user!._id);
        if (!isMember || !isMember.teamId.equals(teamId)) {
          throw new AppError(403, 'FORBIDDEN', 'Only team members can view audit history');
        }

        const cursorStr = req.query['cursor'] as string | undefined;
        const cursorDate = cursorStr ? new Date(Buffer.from(cursorStr, 'base64url').toString('utf8')) : undefined;
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;

        const events = await auditService.getTeamAuditEvents(teamId, limit + 1, cursorDate);
        const hasMore = events.length > limit;
        const pageItems = hasMore ? events.slice(0, limit) : events;
        const nextCursor =
          hasMore && pageItems.length > 0
            ? Buffer.from(pageItems[pageItems.length - 1]!.occurredAt.toISOString()).toString('base64url')
            : null;

        const mapped = pageItems.map((e) => ({
          id: e._id.toHexString(),
          hackathonId: e.hackathonId.toHexString(),
          teamId: e.teamId.toHexString(),
          actorId: e.actorId.toHexString(),
          action: e.action,
          subjectId: e.subjectId?.toHexString() ?? null,
          changes: e.changes ?? undefined,
          occurredAt: e.occurredAt.toISOString(),
          requestId: e.requestId
        }));

        const response: SuccessEnvelope<typeof mapped> = {
          data: mapped,
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

function encodeCursor(item: { updatedAt: Date; _id: ObjectId }): string {
  return Buffer.from(
    JSON.stringify({ u: item.updatedAt.toISOString(), id: item._id.toHexString() })
  ).toString('base64url');
}

export function createHackathonTeamRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-09: GET /api/v1/hackathons/:hackathonId/teams (Live team board)
  router.get(
    '/',
    requireAuth,
    validateRequest({ params: HackathonParamsSchema, query: TeamBoardQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hackathonId = toId(req.params['hackathonId']!);
        const { search, skill, onlyOpen, cursor, limit = 12 } = req.query as any;

        const cursorDecoded = decodeCursor(cursor);
        const teams = await teamRepo.listTeamsForBoard({
          hackathonId,
          search,
          skill,
          onlyOpen,
          limit: limit + 1,
          cursor: cursorDecoded
        });

        const hasMore = teams.length > limit;
        const pageItems = hasMore ? teams.slice(0, limit) : teams;
        const nextCursor =
          hasMore && pageItems.length > 0
            ? encodeCursor(pageItems[pageItems.length - 1]!)
            : null;

        const mapped = pageItems.map((team) =>
          membershipService.toTeamResponse(team, req.user?._id)
        );

        const response: SuccessEnvelope<typeof mapped> = {
          data: mapped,
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

  // A-10: POST /api/v1/hackathons/:hackathonId/teams (Create team)
  router.post(
    '/',
    requireAuth,
    validateRequest({ params: HackathonParamsSchema, body: CreateTeamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hackathonId = toId(req.params['hackathonId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { team, replayed } = await membershipService.createTeam({
          actorId: req.user!._id,
          hackathonId,
          name: req.body.name,
          description: req.body.description,
          minSize: req.body.minSize,
          maxSize: req.body.maxSize,
          requiredSkills: req.body.requiredSkills,
          requestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof team> = {
          data: team,
          meta: { requestId: req.requestId }
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
