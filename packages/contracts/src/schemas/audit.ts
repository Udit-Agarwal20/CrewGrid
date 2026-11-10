import { z } from 'zod';
import { ObjectIdSchema, DateTimeSchema } from './common.js';

export const AuditActionSchema = z.enum([
  'team.created',
  'team.updated',
  'team.deleted',
  'member.joined',
  'member.left',
  'member.removed',
  'leader.transferred',
  'request.created',
  'request.approved',
  'request.declined',
  'request.canceled',
  'invite.created',
  'invite.revoked',
  'invite.redeemed'
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEventResponseSchema = z.object({
  id: ObjectIdSchema,
  hackathonId: ObjectIdSchema,
  teamId: ObjectIdSchema,
  actorId: ObjectIdSchema,
  action: AuditActionSchema,
  subjectId: ObjectIdSchema.nullable().optional(),
  changes: z.record(z.unknown()).optional(),
  occurredAt: DateTimeSchema,
  requestId: z.string().optional()
});

export type AuditEventResponse = z.infer<typeof AuditEventResponseSchema>;

