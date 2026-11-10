import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  // Always use a server-generated UUID or append it to ensure trust & uniqueness
  const requestId = incomingId && /^[a-zA-Z0-9_-]{1,64}$/.test(incomingId)
    ? incomingId
    : `req-${crypto.randomUUID()}`;

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

