import { z } from 'zod';
import { ObjectIdSchema, DateTimeSchema } from './common.js';

export const JoinRequestStatusSchema = z.enum([
  'pending',
  'approved',
  'declined',
  'canceled',
  'invalidated'
]);

export type JoinRequestStatus = z.infer<typeof JoinRequestStatusSchema>;

export const CreateJoinRequestSchema = z.object({
  message: z.string().trim().max(280).default('')
});

export type CreateJoinRequestInput = z.infer<typeof CreateJoinRequestSchema>;

export const JoinRequestResponseSchema = z.object({
  id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  applicantId: ObjectIdSchema,
  status: JoinRequestStatusSchema,
  message: z.string().optional(),
  createdAt: DateTimeSchema,
  resolvedAt: DateTimeSchema.nullable().optional()
});

export type JoinRequestResponse = z.infer<typeof JoinRequestResponseSchema>;

