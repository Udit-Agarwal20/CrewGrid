import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { requestService } from './request.service.js';
import { requireAuth } from '../../middleware/session.js';
import { validateRequest } from '../../middleware/validation.js';
import {
  ObjectIdSchema,
  CreateJoinRequestSchema,
  SuccessEnvelope
} from '@crewgrid/contracts';

const TeamParamsSchema = z.object({
  teamId: ObjectIdSchema
});

const RequestParamsSchema = z.object({
  requestId: ObjectIdSchema
});

const toId = (param: string | string[]): ObjectId => new ObjectId(Array.isArray(param) ? param[0]! : param);

export function createTeamRequestRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-13: POST /api/v1/teams/:teamId/requests
  router.post(
    '/',
    requireAuth,
    validateRequest({ params: TeamParamsSchema, body: CreateJoinRequestSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { request, replayed } = await requestService.createRequest({
          applicantId: req.user!._id,
          teamId,
          message: req.body.message,
          traceRequestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof request> = {
          data: request,
          meta: { requestId: req.requestId }
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-14: GET /api/v1/teams/:teamId/requests (Leader only)
  router.get(
    '/',
    requireAuth,
    validateRequest({ params: TeamParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const teamId = toId(req.params['teamId']!);
        const status = req.query['status'] as any;
        const cursor = req.query['cursor'] as string | undefined;
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;

        const { requests, nextCursor } = await requestService.listTeamRequests({
          actorId: req.user!._id,
          teamId,
          status,
          limit,
          cursor
        });

        const response: SuccessEnvelope<typeof requests> = {
          data: requests,
          meta: {
            requestId: req.requestId,
            nextCursor,
            hasMore: nextCursor !== null
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

export function createRequestRouter(): Router {
  const router = Router();

  // A-15: GET /api/v1/requests/mine
  router.get('/mine', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cursor = req.query['cursor'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;

      const { requests, nextCursor } = await requestService.listMyRequests({
        applicantId: req.user!._id,
        limit,
        cursor
      });

      const response: SuccessEnvelope<typeof requests> = {
        data: requests,
        meta: {
          requestId: req.requestId,
          nextCursor,
          hasMore: nextCursor !== null
        }
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  // A-16: POST /api/v1/requests/:requestId/approve
  router.post(
    '/:requestId/approve',
    requireAuth,
    validateRequest({ params: RequestParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const requestId = toId(req.params['requestId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { request, replayed } = await requestService.approveRequest({
          actorId: req.user!._id,
          requestId,
          traceRequestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof request> = {
          data: request,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-17: POST /api/v1/requests/:requestId/decline
  router.post(
    '/:requestId/decline',
    requireAuth,
    validateRequest({ params: RequestParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const requestId = toId(req.params['requestId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { request, replayed } = await requestService.declineRequest({
          actorId: req.user!._id,
          requestId,
          traceRequestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof request> = {
          data: request,
          meta: { requestId: req.requestId }
        };
        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-18: POST /api/v1/requests/:requestId/cancel
  router.post(
    '/:requestId/cancel',
    requireAuth,
    validateRequest({ params: RequestParamsSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const requestId = toId(req.params['requestId']!);
        const idempotencyKey = req.header('idempotency-key');

        const { request, replayed } = await requestService.cancelRequest({
          applicantId: req.user!._id,
          requestId,
          traceRequestId: req.requestId,
          idempotencyKey
        });

        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
        }

        const response: SuccessEnvelope<typeof request> = {
          data: request,
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
