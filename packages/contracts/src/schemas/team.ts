import { z } from 'zod';
import { ObjectIdSchema } from './common.js';

export const CreateTeamSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'Team name must be at least 3 characters')
      .max(60, 'Team name cannot exceed 60 characters'),
    description: z
      .string()
      .trim()
      .max(500, 'Description cannot exceed 500 characters')
      .default(''),
    minSize: z.coerce.number().int().min(1, 'minSize must be at least 1'),
    maxSize: z.coerce.number().int().min(1, 'maxSize must be at least 1'),
    requiredSkills: z
      .array(z.string().trim().max(40))
      .max(10, 'Maximum 10 required skills')
      .default([])
  })
  .refine((data) => data.minSize <= data.maxSize, {
    message: 'minSize cannot be greater than maxSize',
    path: ['minSize']
  });

export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

export const EditTeamSchema = z
  .object({
    name: z.string().trim().min(3).max(60).optional(),
    description: z.string().trim().max(500).optional(),
    minSize: z.coerce.number().int().min(1).optional(),
    maxSize: z.coerce.number().int().min(1).optional(),
    requiredSkills: z.array(z.string().trim().max(40)).max(10).optional()
  })
  .refine(
    (data) => {
      if (data.minSize !== undefined && data.maxSize !== undefined) {
        return data.minSize <= data.maxSize;
      }
      return true;
    },
    {
      message: 'minSize cannot be greater than maxSize',
      path: ['minSize']
    }
  );

export type EditTeamInput = z.infer<typeof EditTeamSchema>;

export const TeamStageSchema = z.enum(['forming', 'ready']);
export type TeamStage = z.infer<typeof TeamStageSchema>;

export const TeamResponseSchema = z.object({
  id: ObjectIdSchema,
  hackathonId: ObjectIdSchema,
  name: z.string(),
  description: z.string(),
  leaderId: ObjectIdSchema,
  memberCount: z.number().int().min(0),
  minSize: z.number().int().min(1),
  maxSize: z.number().int().min(1),
  openSeats: z.number().int().min(0),
  stage: TeamStageSchema,
  requiredSkills: z.array(z.string()),
  viewerPermissions: z.array(z.string()).default([])
});

export type TeamResponse = z.infer<typeof TeamResponseSchema>;

export const TeamMemberSchema = z.object({
  userId: ObjectIdSchema,
  displayName: z.string(),
  handle: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  timezone: z.string().nullable().optional(),
  role: z.enum(['leader', 'member']),
  joinedAt: z.string()
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamBoardQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  skill: z.string().trim().max(40).optional(),
  onlyOpen: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((val) => val === true || val === 'true' || val === '1')
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

export type TeamBoardQuery = z.infer<typeof TeamBoardQuerySchema>;

