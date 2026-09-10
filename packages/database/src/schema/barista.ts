import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { cafes } from './cafes.js';

/**
 * Barista-facing, cafe-scoped credentials (PRD Module 8's barista role;
 * Module 7.5/9's per-cafe payout rate). Deliberately NOT columns on `cafes`
 * itself: `cafes` backs the public cafe-discovery API (Modules 3/4), and
 * keeping the PIN hash and payout rate in a separate table makes it
 * structurally impossible for a `select()`-all on `cafes` to ever leak them
 * to a browsing client.
 *
 * One row per cafe, created the first time a cafe is onboarded to the
 * barista flow — a cafe with no row here cannot authenticate a barista
 * device, and (per the redemption-eligibility check) cannot have a
 * redemption created against it either, since there is no payout rate to
 * snapshot. Setting the real PIN/payout rate for a partner cafe is Module 9
 * admin work (Phase 6, `apps/api/src/services/adminCafeService.ts`) —
 * `packages/database/src/seed.ts` seeds development-only values so the
 * Phase 5 flow is testable end to end without it.
 *
 * `pinHash` uses the same bcrypt helper as member passwords
 * (`apps/api/src/lib/password.ts`) — a PIN is a credential like any other.
 * Nullable (Phase 6) because the admin cafe screen sets the payout rate and
 * the PIN as two independent actions (PRD Module 9: "set payout rate...
 * set/reset its PIN" are separate bullets) — a cafe can have a payout rate
 * configured before a PIN exists, or vice versa; `baristaService.authenticate`
 * treats a null `pinHash` the same as a wrong PIN (same generic error, never
 * reveals which case it was). `pinVersion` increments every time the PIN is
 * set or reset; a trusted device's grant is bound to the `pinVersion` active
 * when it was issued, so a reset invalidates every previously-trusted device
 * at once without a row-by-row delete (PRD: "reset a PIN to sign out every
 * trusted device... at once").
 */
export const cafeBaristaCredentials = pgTable(
  'cafe_barista_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cafeId: uuid('cafe_id')
      .notNull()
      .unique()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    pinHash: text('pin_hash'),
    pinVersion: integer('pin_version').notNull().default(1),
    /**
     * Dollars-per-credit paid to this cafe (PRD Module 7.5), set/edited via
     * `adminCafeService.setPayoutRate`. Nullable until an admin sets it — a
     * redemption cannot be created against a cafe whose rate is null
     * (apps/api/src/services/redemptionService.ts). ADR-0009: this is
     * unrelated to the fixed $1/credit member-facing value.
     */
    payoutRateCents: integer('payout_rate_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    payoutRatePositive: check(
      'cafe_barista_credentials_payout_rate_positive',
      sql`${table.payoutRateCents} is null or ${table.payoutRateCents} > 0`,
    ),
  }),
);

/**
 * A barista browser session that stayed trusted after a successful PIN
 * entry (PRD Module 8: "enters the cafe PIN once, after which that device
 * stays trusted"). Same opaque-token-hashed-at-rest pattern as
 * `refresh_tokens` (ADR-0004) — the raw token lives only in an httpOnly
 * cookie on the barista's browser, never in localStorage, never logged.
 *
 * `pinVersionAtIssue` is compared against the cafe's current `pinVersion`
 * on every use, not just at issue time — an admin PIN reset (Phase 6) bumps
 * `pinVersion`, which instantly invalidates every device trusted under the
 * old version without touching this table.
 *
 * The trust duration (`expiresAt`) is an interim engineering default, not a
 * PRD-specified figure — see docs/decisions/open-questions.md.
 */
export const baristaTrustedDevices = pgTable(
  'barista_trusted_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cafeId: uuid('cafe_id')
      .notNull()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    deviceTokenHash: text('device_token_hash').notNull().unique(),
    pinVersionAtIssue: integer('pin_version_at_issue').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cafeIdIdx: index('barista_trusted_devices_cafe_id_idx').on(table.cafeId),
  }),
);
