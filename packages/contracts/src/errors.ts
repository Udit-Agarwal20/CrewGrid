import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'INVALID_JSON',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_TEAM_LEADER',
  'CSRF_FAILED',
  'TEAM_NOT_FOUND',
  'REQUEST_NOT_FOUND',
  'INVITE_NOT_FOUND',
  'TEAM_FULL',
  'ALREADY_IN_TEAM',
  'ALREADY_PENDING',
  'REQUEST_ALREADY_RESOLVED',
  'INVITE_EXPIRED',
  'INVITE_USED',
  'INVITE_REVOKED',
  'TEAM_SIZE_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'TEMPORARILY_UNAVAILABLE',
  'INTERNAL_ERROR'
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const MetaSchema = z.object({
  requestId: z.string(),
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional()
});

export type Meta = z.infer<typeof MetaSchema>;

export const ErrorDetailSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional()
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: ErrorDetailSchema,
  meta: MetaSchema
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const SuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: MetaSchema
  });

export type SuccessEnvelope<T> = {
  data: T;
  meta: Meta;
};

export class AppError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

