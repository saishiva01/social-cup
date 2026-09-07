import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The Social Cup account record (PRD Module 2). `coffeePreferences` is stored
 * as jsonb (a validated array of the four PRD enum values) rather than a
 * native Postgres enum array — enum-array columns are a rougher edge in the
 * pinned drizzle-orm@0.33, and the allowed-values invariant is enforced by
 * Zod at the API boundary instead.
 *
 * No OAuth-identity columns/table exist here on purpose: Google/Apple sign-in
 * are UI placeholders only in this phase (see docs/architecture/authentication.md)
 * — a real identity table is added alongside actual token verification, not
 * speculatively ahead of it.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  profilePhotoUrl: text('profile_photo_url'),
  coffeePreferences: jsonb('coffee_preferences')
    .notNull()
    .default(sql`'[]'::jsonb`),
  neighborhood: text('neighborhood'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
