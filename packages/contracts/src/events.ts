import { z } from 'zod';
import { ObjectIdSchema, DateTimeSchema } from './schemas/common.js';

export const RealtimeEventTypeSchema = z.enum([
  'team.created',
  'team.updated',
  'member.joined',
  'member.left',
  'request.created',
  'request.resolved',
  'leader.transferred',
  'team.deleted'
]);

export type RealtimeEventType = z.infer<typeof RealtimeEventTypeSchema>;

export const RealtimeEventScopeSchema = z.enum(['public-hackathon', 'team', 'user']);

export type RealtimeEventScope = z.infer<typeof RealtimeEventScopeSchema>;

export const RealtimeEventEnvelopeSchema = z.object({
  eventId: ObjectIdSchema,
  eventType: RealtimeEventTypeSchema,
  hackathonId: ObjectIdSchema,
  teamId: ObjectIdSchema.nullable().optional(),
  userId: ObjectIdSchema.nullable().optional(),
  scope: RealtimeEventScopeSchema,
  occurredAt: DateTimeSchema,
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
});

export type RealtimeEventEnvelope = z.infer<typeof RealtimeEventEnvelopeSchema>;

