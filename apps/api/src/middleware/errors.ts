import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorEnvelope } from '@crewgrid/contracts';
import { logger } from '../observability/logger.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'req-unknown';

  // 1. Handled AppError
  if (err instanceof AppError) {
    const payload: ErrorEnvelope = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      meta: {
        requestId
      }
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  // 2. Syntax / JSON Parse Error
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    const payload: ErrorEnvelope = {
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload'
      },
      meta: {
        requestId
      }
    };
    res.status(400).json(payload);
    return;
  }

  // 3. MongoDB Duplicate Key Error (Code 11000)
  if (err.code === 11000) {
    const keyPattern = err.keyPattern || {};
    let code: any = 'VALIDATION_FAILED';
    let message = 'Duplicate resource conflict';

    if (keyPattern.emailNormalized) {
      code = 'VALIDATION_FAILED';
      message = 'An account with this email address already exists';
    } else if (keyPattern.hackathonId && keyPattern.userId) {
      code = 'ALREADY_IN_TEAM';
      message = 'User is already a member of a team in this hackathon';
    } else if (keyPattern.actorId && keyPattern.scope && keyPattern.key) {
      code = 'IDEMPOTENCY_KEY_REUSED';
      message = 'Idempotency key collision';
    }

    const payload: ErrorEnvelope = {
      error: {
        code,
        message,
        details: { keyPattern }
      },
      meta: {
        requestId
      }
    };
    res.status(409).json(payload);
    return;
  }

  // 4. Unexpected Internal Error
  logger.error(
    {
      requestId,
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method
    },
    'Unhandled server error'
  );

  const payload: ErrorEnvelope = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred'
    },
    meta: {
      requestId
    }
  };

  res.status(500).json(payload);
}

