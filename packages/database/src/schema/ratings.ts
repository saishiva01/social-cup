import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { drinks } from './cafes.js';
import { users } from './users.js';

/**
 * Drink ratings (PRD Module 5). A rating IS the diary entry — the PRD's
 * diary screen lists "every drink a member has rated" with the same fields
 * a rating already carries, so there is no separate diary table to keep in
 * sync. `cafeId` is intentionally not duplicated here; it's reached through
 * `drinkId -> drinks.cafeId` (PRD: avoid unnecessary duplication).
 *
 * One rating per user per drink, editable at any time (not deletable — the
 * PRD only ever says "editable", see docs/decisions/open-questions.md #8),
 * enforced by the unique index below and consumed via an atomic
 * `ON CONFLICT DO UPDATE` upsert rather than check-then-insert.
 */
export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    drinkId: uuid('drink_id')
      .notNull()
      .references(() => drinks.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userDrinkUnique: uniqueIndex('ratings_user_drink_unique').on(table.userId, table.drinkId),
    drinkIdIdx: index('ratings_drink_id_idx').on(table.drinkId),
    userIdIdx: index('ratings_user_id_idx').on(table.userId),
    starsRange: check('ratings_stars_range', sql`${table.stars} between 1 and 5`),
    noteLength: check('ratings_note_length', sql`char_length(${table.note}) <= 140`),
  }),
);
