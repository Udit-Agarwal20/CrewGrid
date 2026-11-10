import { z } from 'zod';
import { ObjectIdSchema } from './common.js';

export const ScoreComponentSchema = z.object({
  complementarySkills: z.number().int().min(0).max(100),
  timezoneFit: z.number().int().min(0).max(100)
});

export type ScoreComponent = z.infer<typeof ScoreComponentSchema>;

export const SuggestionSchema = z.object({
  userId: ObjectIdSchema,
  displayName: z.string(),
  score: z.number().int().min(0).max(100),
  components: ScoreComponentSchema,
  reasons: z.array(z.string())
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const TeammatesQuerySchema = z.object({
  skill: z.string().trim().max(40).optional(),
  timezone: z.string().trim().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

export type TeammatesQuery = z.infer<typeof TeammatesQuerySchema>;

