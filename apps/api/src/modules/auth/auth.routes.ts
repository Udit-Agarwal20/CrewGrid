import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { validateRequest } from '../../middleware/validation.js';
import { requireAuth } from '../../middleware/session.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { RegisterRequestSchema, LoginRequestSchema, SuccessEnvelope } from '@crewgrid/contracts';
import { env } from '../../config/env.js';

export function createAuthRouter(authService: AuthService = new AuthService()): Router {
  const router = Router();

  const authLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts, please try again in a minute'
  });

  // A-01: Register
  router.post(
    '/register',
    authLimiter,
    validateRequest({ body: RegisterRequestSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await authService.register(req.body);
        const response: SuccessEnvelope<typeof user> = {
          data: user,
          meta: { requestId: req.requestId }
        };
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  // A-02: Login
  router.post(
    '/login',
    authLimiter,
    validateRequest({ body: LoginRequestSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.login(req.body, res);
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

  // A-03: Logout
  router.post(
    '/logout',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];
        await authService.logout(rawToken, res);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  // A-04: Me
  router.get(
    '/me',
    requireAuth,
    async (req: Request, res: Response) => {
      const user = authService.toPublicUser(req.user!);
      const response: SuccessEnvelope<typeof user> = {
        data: user,
        meta: { requestId: req.requestId }
      };
      res.status(200).json(response);
    }
  );

  // A-05: CSRF Token for authenticated mutations
  router.get(
    '/csrf',
    requireAuth,
    async (req: Request, res: Response) => {
      const csrfToken = req.sessionRecord!.csrfToken;
      const response: SuccessEnvelope<{ csrfToken: string }> = {
        data: { csrfToken },
        meta: { requestId: req.requestId }
      };
      res.status(200).json(response);
    }
  );

  return router;
}

