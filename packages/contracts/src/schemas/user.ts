import { z } from 'zod';

export const PreferredHoursSchema = z.object({
  startLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Must be in HH:MM format'),
  endLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Must be in HH:MM format'),
  days: z.array(z.number().int().min(0).max(6)).optional()
});

export type PreferredHours = z.infer<typeof PreferredHoursSchema>;

export const ProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60).optional(),
    handle: z.string().trim().min(3).max(24).optional(),
    bio: z.string().trim().max(280).optional(),
    skills: z.array(z.string().trim().max(40)).max(15).optional(),
    timezone: z.string().trim().optional(),
    preferredHours: PreferredHoursSchema.optional(),
    discoverable: z.boolean().optional()
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
