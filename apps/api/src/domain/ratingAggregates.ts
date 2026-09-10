import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { avg, count, eq, inArray } from 'drizzle-orm';

const { ratings, drinks } = schema;

export interface RatingAggregate {
  averageRating: number | null;
  ratingCount: number;
}

const NO_RATINGS: RatingAggregate = { averageRating: null, ratingCount: 0 };

export function ratingAggregateFor(map: Map<string, RatingAggregate>, id: string): RatingAggregate {
  return map.get(id) ?? NO_RATINGS;
}

/** Batched per-drink rating aggregates (PRD Module 5: "each drink shows its own average and rating count") — one query for every drink on the page, never N+1. */
export async function drinkRatingAggregatesFor(
  db: DB,
  drinkIds: string[],
): Promise<Map<string, RatingAggregate>> {
  const map = new Map<string, RatingAggregate>();
  if (drinkIds.length === 0) return map;

  const rows = await db
    .select({
      drinkId: ratings.drinkId,
      averageRating: avg(ratings.stars),
      ratingCount: count(ratings.id),
    })
    .from(ratings)
    .where(inArray(ratings.drinkId, drinkIds))
    .groupBy(ratings.drinkId);

  for (const row of rows) {
    map.set(row.drinkId, {
      averageRating: row.averageRating === null ? null : Number(row.averageRating),
      ratingCount: row.ratingCount,
    });
  }
  return map;
}

/**
 * Batched per-cafe rating aggregates. A cafe's rating is the average across
 * all individual ratings of its drinks (weighted, not an average of each
 * drink's own average) — the PRD's "average of its drinks' ratings" reads
 * both ways; see docs/decisions/open-questions.md #8 for the exact ambiguity
 * and why this reading was chosen as the interim implementation.
 */
export async function cafeRatingAggregatesFor(
  db: DB,
  cafeIds: string[],
): Promise<Map<string, RatingAggregate>> {
  const map = new Map<string, RatingAggregate>();
  if (cafeIds.length === 0) return map;

  const rows = await db
    .select({
      cafeId: drinks.cafeId,
      averageRating: avg(ratings.stars),
      ratingCount: count(ratings.id),
    })
    .from(ratings)
    .innerJoin(drinks, eq(ratings.drinkId, drinks.id))
    .where(inArray(drinks.cafeId, cafeIds))
    .groupBy(drinks.cafeId);

  for (const row of rows) {
    map.set(row.cafeId, {
      averageRating: row.averageRating === null ? null : Number(row.averageRating),
      ratingCount: row.ratingCount,
    });
  }
  return map;
}
