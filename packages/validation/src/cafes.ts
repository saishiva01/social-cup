import { z } from 'zod';

import { neighborhoodSchema } from './auth.js';
import { paginationQuerySchema } from './common.js';

/**
 * Coordinate bounds, shared with the Phase 6 admin cafe-creation schema
 * (`packages/validation/src/admin.ts`) — used here for optional device
 * coordinates (never persisted) and there for a cafe's stored location.
 */
export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

const searchSchema = z.string().trim().min(1).max(100);

/** GET /api/v1/cafes — the full, searchable/filterable/paginated cafe list. */
export const cafeListQuerySchema = paginationQuerySchema.extend({
  search: searchSchema.optional(),
  neighborhood: neighborhoodSchema.optional(),
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
});

export type CafeListQuery = z.infer<typeof cafeListQuerySchema>;

/**
 * GET /api/v1/cafes/featured — the "New on Social Cup" curated strip (PRD
 * Module 6). Not paginated — it's a small, capped list, not a browsable page.
 */
export const curatedCafesQuerySchema = z.object({
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
});

export type CuratedCafesQuery = z.infer<typeof curatedCafesQuerySchema>;
