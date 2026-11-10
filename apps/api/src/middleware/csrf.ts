import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '@crewgrid/contracts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Verify Origin header when present
  const origin = req.header('origin');
  if (origin) {
    const allowedOrigin = env.APP_ORIGIN.replace(/\/$/, '');
    const reqOrigin = origin.replace(/\/$/, '');
    // Allow localhost/127.0.0.1 origins in development or matching APP_ORIGIN
    const isAllowed =
      reqOrigin === allowedOrigin ||
      (env.NODE_ENV !== 'production' &&
        (/^http:\/\/localhost(:\d+)?$/.test(reqOrigin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(reqOrigin)));

    if (!isAllowed) {
      return next(new AppError(403, 'CSRF_FAILED', 'Cross-origin request rejected'));
    }
  }

  // If user has an authenticated session, verify X-CSRF-Token header
  if (req.sessionRecord) {
    const providedToken = req.header('x-csrf-token');
    if (!providedToken) {
      return next(new AppError(403, 'CSRF_FAILED', 'Missing X-CSRF-Token header'));
    }

    const expectedToken = req.sessionRecord.csrfToken;
    const providedBuffer = Buffer.from(providedToken);
    const expectedBuffer = Buffer.from(expectedToken);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return next(new AppError(403, 'CSRF_FAILED', 'Invalid X-CSRF-Token header'));
    }
  }

  next();
}

