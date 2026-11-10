import { Router, Request, Response, NextFunction } from 'express';
import { hackathonRepo } from './hackathon.repo.js';
import { SuccessEnvelope } from '@crewgrid/contracts';

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

  return router;
}

