import { z } from 'zod';
import { ObjectIdSchema } from './common.js';

export const TransferLeadershipSchema = z.object({
  newLeaderId: ObjectIdSchema
});

export type TransferLeadershipInput = z.infer<typeof TransferLeadershipSchema>;

export const LeaveTeamResponseSchema = z.object({
  teamDeleted: z.boolean(),
  successorId: ObjectIdSchema.nullable().optional()
});

export type LeaveTeamResponse = z.infer<typeof LeaveTeamResponseSchema>;

