import { z } from 'zod';
import { ObjectIdSchema } from './common.js';
import { PreferredHoursSchema } from './user.js';

export const RegisterRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(255, 'Email too long'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(60, 'Display name cannot exceed 60 characters')
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters')
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PublicUserSchema = z.object({
  id: ObjectIdSchema,
  displayName: z.string(),
  handle: z.string().nullable().optional(),
  bio: z.string().max(280).optional(),
  skills: z.array(z.string().max(40)).max(15).default([]),
  timezone: z.string().optional(),
  preferredHours: PreferredHoursSchema.optional(),
  discoverable: z.boolean().default(false)
});

export type PublicUser = z.infer<typeof PublicUserSchema>;

export const CsrfResponseSchema = z.object({
  csrfToken: z.string()
});

export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;

export const LoginResponseSchema = z.object({
  user: PublicUserSchema,
  csrfToken: z.string()
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

