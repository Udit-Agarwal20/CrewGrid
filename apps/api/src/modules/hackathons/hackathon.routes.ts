import { Router, Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { hackathonRepo } from './hackathon.repo.js';
import { AppError, SuccessEnvelope } from '@crewgrid/contracts';

export function createHackathonRouter(): Router {
  const router = Router();

  // A-08: List active hackathons
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const active = await hackathonRepo.listActive();
      const mapped = active.map((h) => ({
        id: h._id.toHexString(),
        slug: h.slug,
        title: h.title,
        minTeamSize: h.minTeamSize,
        maxTeamSize: h.maxTeamSize,
        startsAt: h.startsAt?.toISOString(),
        endsAt: h.endsAt?.toISOString(),
        active: h.active
      }));

      const response: SuccessEnvelope<typeof mapped> = {
        data: mapped,
        meta: { requestId: req.requestId }
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  // Get single hackathon by ID
  router.get('/:hackathonId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hackathonId = Array.isArray(req.params['hackathonId'])
        ? req.params['hackathonId'][0]
        : req.params['hackathonId'];
      if (!hackathonId || !ObjectId.isValid(hackathonId)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid hackathon ID');
      }
      const h = await hackathonRepo.findById(new ObjectId(hackathonId));
      if (!h) {
        throw new AppError(404, 'TEAM_NOT_FOUND', 'Hackathon not found');
      }
      const data = {
        id: h._id.toHexString(),
        slug: h.slug,
        title: h.title,
        minTeamSize: h.minTeamSize,
        maxTeamSize: h.maxTeamSize,
        startsAt: h.startsAt?.toISOString(),
        endsAt: h.endsAt?.toISOString(),
        active: h.active
      };
      const response: SuccessEnvelope<typeof data> = {
        data,
        meta: { requestId: req.requestId }
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

