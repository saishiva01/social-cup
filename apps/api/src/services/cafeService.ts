import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type {
  CafeDetail,
  CafeListItem,
  PaginatedResult,
  SignatureDrinkListItem,
} from '@social-cup/types';
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';

import { toCafe, toDrink } from '../domain/cafeMappers.js';
import {
  cafeRatingAggregatesFor,
  drinkRatingAggregatesFor,
  ratingAggregateFor,
} from '../domain/ratingAggregates.js';
import { NotFoundError } from '../errors/AppError.js';

const { cafes, drinks, users } = schema;

/** Small, curated lists (PRD Module 6) — not paginated, intentionally capped. */
const CURATED_LIMIT = 10;
const SIGNATURE_LIMIT = 10;

export interface ListCafesParams {
  search?: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
  page: number;
  pageSize: number;
}

export interface CuratedCafesParams {
  userId: string;
  lat?: number;
  lng?: number;
}

export interface CafeService {
  list(params: ListCafesParams): Promise<PaginatedResult<CafeListItem>>;
  getFeatured(params: CuratedCafesParams): Promise<CafeListItem[]>;
  getSignatureDrinks(): Promise<SignatureDrinkListItem[]>;
  getNeighborhoods(): Promise<string[]>;
  getDetail(id: string): Promise<CafeDetail>;
}

/** Haversine distance in miles from (lat, lng) to each cafe row. Clamped to avoid acos NaN from float rounding. */
function distanceMilesExpr(lat: number, lng: number): SQL<number> {
  return sql<number>`3959 * acos(greatest(-1, least(1,
    cos(radians(${lat})) * cos(radians(${cafes.latitude}::double precision)) * cos(radians(${cafes.longitude}::double precision) - radians(${lng}))
    + sin(radians(${lat})) * sin(radians(${cafes.latitude}::double precision))
  )))`;
}

/** True when the cafe has an active drink whose category matches one of the member's stated coffee preferences (PRD Module 6). */
/** Callers only invoke this with a non-empty `preferences` array. */
function preferenceMatchExpr(preferences: string[]): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from ${drinks}
    where ${drinks.cafeId} = ${cafes.id}
      and ${drinks.isActive} = true
      and (${inArray(drinks.category, preferences)})
  )`;
}

async function lowestCreditPricesFor(db: DB, cafeIds: string[]): Promise<Map<string, number>> {
  if (cafeIds.length === 0) return new Map();

  const rows = await db
    .select({ cafeId: drinks.cafeId, creditPrice: drinks.creditPrice })
    .from(drinks)
    .where(and(inArray(drinks.cafeId, cafeIds), eq(drinks.isActive, true)));

  const lowest = new Map<string, number>();
  for (const row of rows) {
    const current = lowest.get(row.cafeId);
    if (current === undefined || row.creditPrice < current) lowest.set(row.cafeId, row.creditPrice);
  }
  return lowest;
}

interface CafeCardRow {
  id: string;
  name: string;
  neighborhood: string;
  photos: unknown;
  vibeTags: unknown;
  featured: boolean;
  distance: number | null;
}

async function toListItems(db: DB, rows: CafeCardRow[]): Promise<CafeListItem[]> {
  const cafeIds = rows.map((row) => row.id);
  const [lowestPrices, ratingAggregates] = await Promise.all([
    lowestCreditPricesFor(db, cafeIds),
    cafeRatingAggregatesFor(db, cafeIds),
  ]);

  return rows.map((row) => {
    const aggregate = ratingAggregateFor(ratingAggregates, row.id);
    return {
      id: row.id,
      name: row.name,
      neighborhood: row.neighborhood,
      coverPhotoUrl: (row.photos as string[])[0] ?? null,
      vibeTags: row.vibeTags as string[],
      lowestCreditPrice: lowestPrices.get(row.id) ?? null,
      featured: row.featured,
      distanceMiles: row.distance,
      averageRating: aggregate.averageRating,
      ratingCount: aggregate.ratingCount,
      isNew: aggregate.ratingCount === 0,
    };
  });
}

/**
 * Cafe discovery reads (PRD Modules 3, 4, and the discovery-relevant slice
 * of Module 9). Every route this backs is Visitor-accessible — see
 * ADR-0008 — so nothing here checks membership state.
 */
export function createCafeService(deps: { db: DB }): CafeService {
  const { db } = deps;

  return {
    async list(params) {
      const conditions = [];
      if (params.search) conditions.push(ilike(cafes.name, `%${params.search}%`));
      if (params.neighborhood) conditions.push(eq(cafes.neighborhood, params.neighborhood));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ value: count() }).from(cafes).where(where);
      const totalItems = totalRow?.value ?? 0;

      const hasLocation = params.lat !== undefined && params.lng !== undefined;
      const distanceExpr = hasLocation
        ? distanceMilesExpr(params.lat!, params.lng!)
        : sql<number | null>`null`;

      const rows = await db
        .select({
          id: cafes.id,
          name: cafes.name,
          neighborhood: cafes.neighborhood,
          photos: cafes.photos,
          vibeTags: cafes.vibeTags,
          featured: cafes.featured,
          distance: distanceExpr,
        })
        .from(cafes)
        .where(where)
        .orderBy(
          ...(hasLocation ? [asc(distanceExpr)] : [asc(cafes.neighborhood), asc(cafes.name)]),
        )
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize);

      const items = await toListItems(db, rows);

      return {
        items,
        page: params.page,
        pageSize: params.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / params.pageSize)),
      };
    },

    async getFeatured(params) {
      const [user] = await db
        .select({ coffeePreferences: users.coffeePreferences })
        .from(users)
        .where(eq(users.id, params.userId));
      const preferences = (user?.coffeePreferences as string[] | undefined) ?? [];
      const hasPreferences = preferences.length > 0;
      const matchExpr = hasPreferences ? preferenceMatchExpr(preferences) : undefined;

      const hasLocation = params.lat !== undefined && params.lng !== undefined;
      const distanceExpr = hasLocation
        ? distanceMilesExpr(params.lat!, params.lng!)
        : sql<number | null>`null`;

      const rows = await db
        .select({
          id: cafes.id,
          name: cafes.name,
          neighborhood: cafes.neighborhood,
          photos: cafes.photos,
          vibeTags: cafes.vibeTags,
          featured: cafes.featured,
          distance: distanceExpr,
        })
        .from(cafes)
        .orderBy(
          desc(cafes.featured),
          ...(matchExpr ? [desc(matchExpr)] : []),
          ...(hasLocation ? [asc(distanceExpr)] : [asc(cafes.neighborhood), asc(cafes.name)]),
        )
        .limit(CURATED_LIMIT);

      return toListItems(db, rows);
    },

    async getSignatureDrinks() {
      const rows = await db
        .select({
          id: drinks.id,
          cafeId: drinks.cafeId,
          cafeName: cafes.name,
          name: drinks.name,
          description: drinks.description,
          category: drinks.category,
          photoUrl: drinks.photoUrl,
          retailPriceCents: drinks.retailPriceCents,
          creditPrice: drinks.creditPrice,
          signature: drinks.signature,
        })
        .from(drinks)
        .innerJoin(cafes, eq(drinks.cafeId, cafes.id))
        .where(and(eq(drinks.signature, true), eq(drinks.isActive, true)))
        .orderBy(asc(cafes.name), asc(drinks.name))
        .limit(SIGNATURE_LIMIT);

      const ratingAggregates = await drinkRatingAggregatesFor(
        db,
        rows.map((row) => row.id),
      );

      return rows.map((row) => {
        const aggregate = ratingAggregateFor(ratingAggregates, row.id);
        return {
          ...row,
          averageRating: aggregate.averageRating,
          ratingCount: aggregate.ratingCount,
        };
      });
    },

    async getNeighborhoods() {
      const rows = await db
        .selectDistinct({ neighborhood: cafes.neighborhood })
        .from(cafes)
        .orderBy(asc(cafes.neighborhood));
      return rows.map((row) => row.neighborhood);
    },

    async getDetail(id) {
      const [cafeRow] = await db.select().from(cafes).where(eq(cafes.id, id));
      if (!cafeRow) throw new NotFoundError('Cafe not found');

      const drinkRows = await db
        .select()
        .from(drinks)
        .where(and(eq(drinks.cafeId, id), eq(drinks.isActive, true)))
        .orderBy(asc(drinks.name));

      const ratingAggregates = await drinkRatingAggregatesFor(
        db,
        drinkRows.map((row) => row.id),
      );

      return {
        cafe: toCafe(cafeRow),
        drinks: drinkRows.map((row) => toDrink(row, ratingAggregateFor(ratingAggregates, row.id))),
      };
    },
  };
}
