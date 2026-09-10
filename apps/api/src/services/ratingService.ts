import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { DiaryEntry, PaginatedResult, Rating } from '@social-cup/types';
import { and, count, desc, eq } from 'drizzle-orm';

import { NotFoundError } from '../errors/AppError.js';

const { ratings, drinks, cafes } = schema;

type RatingRow = typeof ratings.$inferSelect;

function toRating(row: RatingRow): Rating {
  return {
    id: row.id,
    drinkId: row.drinkId,
    stars: row.stars,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UpsertRatingParams {
  userId: string;
  drinkId: string;
  stars: number;
  note: string | null;
}

export interface ListDiaryParams {
  userId: string;
  page: number;
  pageSize: number;
}

export interface RatingService {
  upsertRating(params: UpsertRatingParams): Promise<Rating>;
  getMyRating(userId: string, drinkId: string): Promise<Rating | null>;
  listDiary(params: ListDiaryParams): Promise<PaginatedResult<DiaryEntry>>;
}

/**
 * Drink ratings and the drink diary (PRD Module 5). Every method takes the
 * userId from the verified access token (req.auth), never from the request
 * body — the same ownership pattern as userService — so a client cannot
 * create, read, or edit another account's ratings.
 */
export function createRatingService(deps: { db: DB }): RatingService {
  const { db } = deps;

  return {
    async upsertRating({ userId, drinkId, stars, note }) {
      // A hidden (isActive: false) drink behaves as absent for rating writes,
      // same as it already does for the menu — this also covers a
      // nonexistent drinkId with the same NotFoundError.
      const [drink] = await db
        .select({ id: drinks.id })
        .from(drinks)
        .where(and(eq(drinks.id, drinkId), eq(drinks.isActive, true)));
      if (!drink) throw new NotFoundError('Drink not found');

      // One rating per user per drink, editable at any time (PRD Module 5):
      // an atomic upsert on the unique (user_id, drink_id) index, never a
      // check-then-insert that could race two concurrent submits.
      const [row] = await db
        .insert(ratings)
        .values({ userId, drinkId, stars, note })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.drinkId],
          set: { stars, note, updatedAt: new Date() },
        })
        .returning();
      return toRating(row!);
    },

    async getMyRating(userId, drinkId) {
      const [row] = await db
        .select()
        .from(ratings)
        .where(and(eq(ratings.userId, userId), eq(ratings.drinkId, drinkId)));
      return row ? toRating(row) : null;
    },

    async listDiary({ userId, page, pageSize }) {
      const [totalRow] = await db
        .select({ value: count() })
        .from(ratings)
        .where(eq(ratings.userId, userId));
      const totalItems = totalRow?.value ?? 0;

      const rows = await db
        .select({
          ratingId: ratings.id,
          stars: ratings.stars,
          note: ratings.note,
          createdAt: ratings.createdAt,
          drinkId: drinks.id,
          drinkName: drinks.name,
          drinkPhotoUrl: drinks.photoUrl,
          cafeId: cafes.id,
          cafeName: cafes.name,
          cafeNeighborhood: cafes.neighborhood,
        })
        .from(ratings)
        .innerJoin(drinks, eq(ratings.drinkId, drinks.id))
        .innerJoin(cafes, eq(drinks.cafeId, cafes.id))
        .where(eq(ratings.userId, userId))
        // "Highest rated first" (PRD Module 5); most recent breaks ties.
        .orderBy(desc(ratings.stars), desc(ratings.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const items: DiaryEntry[] = rows.map((row) => ({
        ratingId: row.ratingId,
        stars: row.stars,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        drink: { id: row.drinkId, name: row.drinkName, photoUrl: row.drinkPhotoUrl },
        cafe: { id: row.cafeId, name: row.cafeName, neighborhood: row.cafeNeighborhood },
      }));

      return {
        items,
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    },
  };
}
