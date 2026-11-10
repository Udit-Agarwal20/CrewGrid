import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { sessionMiddleware } from './middleware/session.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { errorHandler } from './middleware/errors.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createProfileRouter } from './modules/profile/profile.routes.js';
import { createHackathonRouter } from './modules/hackathons/hackathon.routes.js';
import { createTeamRouter, createHackathonTeamRouter } from './modules/teams/team.routes.js';
import { createTeamRequestRouter, createRequestRouter } from './modules/requests/request.routes.js';
import { createTeamInviteRouter, createRedeemInviteRouter } from './modules/invites/invite.routes.js';
import { createTeammatesRouter, createSuggestionsRouter } from './modules/matching/matching.routes.js';
import { createSseRouter } from './realtime/sse.routes.js';
import { getDatabase } from './db/client.js';
import { AppError } from '@crewgrid/contracts';

export function createApp(): Express {
  const app = express();

  // Reverse proxy trust setting
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // 1. Request ID injector (first)
  app.use(requestIdMiddleware);

  // 2. Security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", env.APP_ORIGIN]
        }
      }
    })
  );

  // 3. CORS configuration for frontend
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigin = env.APP_ORIGIN.replace(/\/$/, '');
        const reqOrigin = origin.replace(/\/$/, '');
        if (
          reqOrigin === allowedOrigin ||
          (env.NODE_ENV !== 'production' &&
            (/^http:\/\/localhost(:\d+)?$/.test(reqOrigin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(reqOrigin)))
        ) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'FORBIDDEN', 'CORS origin not allowed'));
        }
      },
      credentials: true
    })
  );

  // 4. Cookie parser
  app.use(cookieParser());

  // 5. JSON body parser with 64KB size limit
  app.use(express.json({ limit: '64kb' }));

  // 6. Session loader
  app.use(sessionMiddleware);

  // 7. CSRF validation for mutating endpoints
  app.use(csrfMiddleware);

  // Health and Readiness controllers (mounted at both root and /api/v1)
  const healthHandler = (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  };

  const readyHandler = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDatabase();
      await db.admin().command({ ping: 1 });
      res.status(200).json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      next(new AppError(503, 'TEMPORARILY_UNAVAILABLE', 'Database not ready'));
    }
  };

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler);
  app.get('/api/v1/health', healthHandler);
  app.get('/api/v1/ready', readyHandler);

  // Auth Routes
  app.use('/api/v1/auth', createAuthRouter());

  // Profile Routes
  app.use('/api/v1/profile', createProfileRouter());

  // Hackathons Routes
  app.use('/api/v1/hackathons', createHackathonRouter());

  // Realtime SSE stream under Hackathons (/api/v1/hackathons/:hackathonId/events)
  app.use('/api/v1/hackathons', createSseRouter());

  // Candidate teammates discovery under Hackathons (/api/v1/hackathons/:hackathonId/teammates)
  app.use('/api/v1/hackathons/:hackathonId/teammates', createTeammatesRouter());

  // Team routes under Hackathon (Live team board & team creation)
  app.use('/api/v1/hackathons/:hackathonId/teams', createHackathonTeamRouter());

  // Team recommendation suggestions (/api/v1/teams/:teamId/suggestions)
  app.use('/api/v1/teams/:teamId/suggestions', createSuggestionsRouter());

  // Team sub-routes (requests & invites)
  app.use('/api/v1/teams/:teamId/requests', createTeamRequestRouter());
  app.use('/api/v1/teams/:teamId/invites', createTeamInviteRouter());

  // Team routes
  app.use('/api/v1/teams', createTeamRouter());

  // Requests top-level routes (/mine, /:requestId/approve, /:requestId/decline, /:requestId/cancel)
  app.use('/api/v1/requests', createRequestRouter());

  // Invites top-level routes (/redeem)
  app.use('/api/v1/invites', createRedeemInviteRouter());

  // Serve built SPA static files if present in production/single-origin mode
  const possibleDistPaths = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), '../../apps/web/dist'),
    path.resolve(process.cwd(), 'dist/apps/web')
  ];
  const webDistPath = possibleDistPaths.find((p) => fs.existsSync(p));

  if (webDistPath) {
    app.use(express.static(webDistPath));

    // For any client-side GET navigation route, serve index.html (never for API or health routes)
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/') && req.path !== '/health' && req.path !== '/ready') {
        return res.sendFile(path.join(webDistPath, 'index.html'));
      }
      next();
    });
  }

  // Catch-all 404 handler for unknown routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(404, 'TEAM_NOT_FOUND', `Cannot ${req.method} ${req.path}`));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

