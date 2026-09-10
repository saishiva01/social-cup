import { check, pgTable, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
 *
 * `role` (Phase 6, PRD Module 9) is a server-side administrative capability,
 * entirely orthogonal to the Visitor/Member *account state* from ADR-0008 —
 * a user can be an unsubscribed Visitor and an admin at the same time. It is
 * never client-settable (see @social-cup/validation's updateProfileSchema,
 * which never accepts it) and is re-checked from the database on every admin
 * request (`apps/api/src/middleware/requireAdmin.ts`), not embedded in the
 * access token, so revoking admin access takes effect immediately rather
 * than waiting out the token's 15-minute lifetime.
 *
 * `deactivatedAt` (PRD Module 9: "deactivate an account when needed") blocks
 * login and revokes all refresh-token sessions at the moment it's set (see
 * authService.login and adminMemberService.setDeactivated) — an existing,
 * still-valid access token can keep working for up to its remaining
 * 15-minute lifetime, the same tradeoff the existing password-reset flow
 * already accepts (ADR-0004's stateless-access-token design trades a DB
 * round trip on every request for this bounded window).
 */
export const users = pgTable(
  'users',
  {
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
    role: text('role').notNull().default('user'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleCheck: check('users_role_check', sql`${table.role} in ('user', 'admin')`),
  }),
);
