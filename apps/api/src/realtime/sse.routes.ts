import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { requireAuth } from '../middleware/session.js';
import { validateRequest } from '../middleware/validation.js';
import { hackathonRepo } from '../modules/hackathons/hackathon.repo.js';
import { membershipRepo } from '../modules/membership/membership.repo.js';
import { connectionManager } from './connection.manager.js';
import { outboxDispatcher } from './dispatcher.js';
import { ObjectIdSchema, AppError } from '@crewgrid/contracts';

const HackathonParamSchema = z.object({
  hackathonId: ObjectIdSchema
});

const toId = (param: string | string[]): ObjectId => new ObjectId(Array.isArray(param) ? param[0]! : param);

export function createSseRouter(): Router {
  const router = Router({ mergeParams: true });

  // A-29: GET /api/v1/hackathons/:hackathonId/events
  router.get(
    '/:hackathonId/events',
    requireAuth,
    validateRequest({ params: HackathonParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hackathonId = toId(req.params['hackathonId']!);

        const hackathon = await hackathonRepo.findById(hackathonId);
        if (!hackathon || !hackathon.active) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Hackathon not found or inactive');
        }

        // Determine user's current team membership in this hackathon
        const membership = await membershipRepo.findActiveMembership(hackathonId, req.user!._id);
        const teamId = membership ? membership.teamId : null;

        // Set mandatory SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        // Send initial connected comment
        res.write(': connected\n\n');
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }

        // Replay missed events if Last-Event-ID header is provided
        const lastIdHeader = req.header('last-event-id') || (req.query['lastEventId'] as string | undefined);
        if (lastIdHeader && ObjectId.isValid(lastIdHeader)) {
          const lastEventId = new ObjectId(lastIdHeader);
          const replayEvents = await outboxDispatcher.getReplayEvents(hackathonId, lastEventId, 50);

          for (const event of replayEvents) {
            let authorized = false;
            if (event.scope === 'public-hackathon') {
              authorized = true;
            } else if (event.scope === 'team' && teamId && event.teamId?.equals(teamId)) {
              authorized = true;
            } else if (event.scope === 'user' && event.userId?.equals(req.user!._id)) {
              authorized = true;
            }

            if (authorized) {
              res.write(connectionManager.formatSseMessage(event));
            }
          }

          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }

        // Register client connection for live stream
        const tokenHash = req.sessionRecord?.tokenHash;
        const connectionId = connectionManager.addConnection(req.user!._id, hackathonId, teamId, res, tokenHash);

        req.on('close', () => {
          connectionManager.removeConnection(connectionId);
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

