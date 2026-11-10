import { z } from 'zod';

export const ObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId hexadecimal format');

export const DateTimeSchema = z.string().datetime();

export const PaginationQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

