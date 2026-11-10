import { z } from 'zod';
import { ObjectIdSchema, DateTimeSchema } from './common.js';

export const CreateInviteSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(72).default(24)
});

export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const RedeemInviteSchema = z.object({
  token: z.string().trim().min(1, 'Invite token is required')
});

export type RedeemInviteInput = z.infer<typeof RedeemInviteSchema>;

export const InviteStatusSchema = z.enum([
  'available',
  'used',
  'expired',
  'revoked'
]);

export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const InviteResponseSchema = z.object({
  id: ObjectIdSchema,
  expiresAt: DateTimeSchema,
  status: InviteStatusSchema,
  token: z.string().optional(),
  redeemUrl: z.string().optional()
});

export type InviteResponse = z.infer<typeof InviteResponseSchema>;

