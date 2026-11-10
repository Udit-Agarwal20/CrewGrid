import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'tokenHash',
      'csrfToken',
      '*.password',
      '*.token'
    ],
    censor: '[REDACTED]'
  },
  base: {
    pid: process.pid,
    env: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

