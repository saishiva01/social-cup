import { z } from 'zod';

/** A UUID id path/query param. */
export const uuidSchema = z.string().uuid();

/** Generic pagination query params shared by every list endpoint. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Email, normalized to lowercase for consistent storage/lookup. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email();
