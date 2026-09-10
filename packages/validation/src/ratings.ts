import { z } from 'zod';

import { paginationQuerySchema } from './common.js';

/** 1–5 stars (PRD Module 5) — no half-stars, no other scale. */
export const starsSchema = z.number().int().min(1).max(5);

/** Optional note, up to 140 characters (PRD Module 5). Empty string normalizes to null. */
export const ratingNoteSchema = z
  .string()
  .trim()
  .max(140)
  .nullable()
  .optional()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

/** PUT /api/v1/drinks/:drinkId/rating — creates or edits the caller's one rating for the drink. */
export const upsertRatingSchema = z.object({
  stars: starsSchema,
  note: ratingNoteSchema,
});

export type UpsertRatingInput = z.infer<typeof upsertRatingSchema>;

/** GET /api/v1/me/ratings — the drink diary, paginated like every other list endpoint. */
export const diaryQuerySchema = paginationQuerySchema;

export type DiaryQuery = z.infer<typeof diaryQuerySchema>;
