import { Request, Response, NextFunction } from 'express';
import { AppError } from '@crewgrid/contracts';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: { windowMs: number; max: number; message?: string }) {
  const hits = new Map<string, RateLimitRecord>();

  // Cleanup interval
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, options.windowMs).unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    // In test environment, do not throttle tests unless explicitly testing rate limits
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const record = hits.get(key);

    if (!record || now > record.resetTime) {
      hits.set(key, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    record.count++;
    if (record.count > options.max) {
      return next(
        new AppError(
          429,
          'RATE_LIMITED',
          options.message || 'Too many requests, please try again later',
          { retryAfterMs: Math.max(0, record.resetTime - now) }
        )
      );
    }

    next();
  };
}

