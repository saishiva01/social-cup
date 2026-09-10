import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Cafe/drink schema (PRD Modules 3, 4, and the discovery-relevant slice of
 * Module 9 — cafe onboarding fields, not the admin CRUD UI itself).
 *
 * `neighborhood` and `vibeTags` are free text/jsonb rather than a fixed
 * taxonomy — the PRD never enumerates a canonical Dallas-neighbourhood list
 * or a vibe-tag vocabulary (see docs/decisions/open-questions.md #4, #4a).
 * That mirrors how `users.neighborhood` was already resolved: a validated
 * free-text value now, promotable to an enum later with no schema change.
 *
 * No payout-rate or PIN column here on purpose — those live in
 * `cafe_barista_credentials` (schema/barista.ts) instead, so a `select()`
 * on this table for the public cafe-discovery API can never leak them.
 */
export const cafes = pgTable(
  'cafes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    perkLine: text('perk_line'),
    neighborhood: text('neighborhood').notNull(),
    address: text('address').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
    longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
    photos: jsonb('photos')
      .notNull()
      .default(sql`'[]'::jsonb`),
    vibeTags: jsonb('vibe_tags')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Per-weekday opening hours, e.g. { "mon": { "open": "07:00", "close": "18:00" }, "sun": null }. */
    hours: jsonb('hours')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Admin-toggled curated-discovery flag (PRD Module 6/9) — hand-set, never computed. */
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    neighborhoodIdx: index('cafes_neighborhood_idx').on(table.neighborhood),
    featuredIdx: index('cafes_featured_idx').on(table.featured),
  }),
);

/**
 * `creditPrice` is a display-only integer (PRD Module 4/9: "credit price
 * alongside retail price") — per ADR-0009 one credit is fixed at exactly $1,
 * so this number is also the drink's dollar value, but nothing here grants,
 * deducts, or checks a member's credit balance. That ledger/redemption logic
 * is Module 7/8, built separately.
 */
export const drinks = pgTable(
  'drinks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cafeId: uuid('cafe_id')
      .notNull()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    photoUrl: text('photo_url'),
    retailPriceCents: integer('retail_price_cents').notNull(),
    creditPrice: integer('credit_price').notNull(),
    /** Curated signature-drink flag (PRD Module 6/9), shown as its own strip. */
    signature: boolean('signature').notNull().default(false),
    /** Lets a drink be hidden without deleting it (PRD Module 9.3). */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cafeIdIdx: index('drinks_cafe_id_idx').on(table.cafeId),
    signatureIdx: index('drinks_signature_idx').on(table.signature),
  }),
);
