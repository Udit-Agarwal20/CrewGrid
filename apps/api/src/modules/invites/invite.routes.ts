import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { inviteService } from './invite.service.js';
import { requireAuth } from '../../middleware/session.js';
import { validateRequest } from '../../middleware/validation.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import {
  ObjectIdSchema,
  CreateInviteSchema,
  RedeemInviteSchema,
  SuccessEnvelope
} from '@crewgrid/contracts';

const TeamParamsSchema = z.object({
  teamId: ObjectIdSchema
});

const RevokeInviteParamsSchema = z.object({
  teamId: ObjectIdSchema,
  inviteId: ObjectIdSchema
});

const toId = (param: string | string[]): ObjectId => new ObjectId(Array.isArray(param) ? param[0]! : param);

export function createTeamInviteRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-19: POST /api/v1/teams/:teamId/invites (Leader creates invite)
  router.post(
    '/',
    requireAuth,
    validateRequest({ params: TeamParamsSchema, body: CreateInviteSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const expiresInHours = req.body.expiresInHours;

        const invite = await inviteService.createInvite({
          actorId: req.user!._id,
          teamId,
          expiresInHours,
          traceRequestId: req.requestId
        });

        const response: SuccessEnvelope<typeof invite> = {
          data: invite,
          meta: { requestId: req.requestId }
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-20: GET /api/v1/teams/:teamId/invites (Leader lists invites)
  router.get(
    '/',
    requireAuth,
    validateRequest({ params: TeamParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const invites = await inviteService.listTeamInvites({
          actorId: req.user!._id,
          teamId
        });

        const response: SuccessEnvelope<typeof invites> = {
          data: invites,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-21: POST /api/v1/teams/:teamId/invites/:inviteId/revoke
  router.post(
    '/:inviteId/revoke',
    requireAuth,
    validateRequest({ params: RevokeInviteParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const inviteId = toId(req.params['inviteId']!);

        await inviteService.revokeInvite({
          actorId: req.user!._id,
          teamId,
          inviteId,
          traceRequestId: req.requestId
        });

        const response: SuccessEnvelope<{ revoked: boolean }> = {
          data: { revoked: true },
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

export function createRedeemInviteRouter(): Router {
  const router = Router();

  const redeemLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many invite redemption attempts, please try again shortly'
  });

  // A-22: POST /api/v1/invites/redeem
  router.post(
    '/redeem',
    requireAuth,
    redeemLimiter,
    validateRequest({ body: RedeemInviteSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const idempotencyKey = req.header('idempotency-key');
        const { team, replayed } = await inviteService.redeemInvite({
          applicantId: req.user!._id,
          rawToken: req.body.token,
          traceRequestId: req.requestId,
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

  return router;
}
