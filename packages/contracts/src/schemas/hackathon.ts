import { z } from 'zod';
import { ObjectIdSchema, DateTimeSchema } from './common.js';

export const HackathonResponseSchema = z.object({
  id: ObjectIdSchema,
  slug: z.string(),
  title: z.string(),
  minTeamSize: z.number().int().min(1),
  maxTeamSize: z.number().int().min(1),
  startsAt: DateTimeSchema.optional(),
  endsAt: DateTimeSchema.optional(),
  active: z.boolean()
});

export type HackathonResponse = z.infer<typeof HackathonResponseSchema>;

