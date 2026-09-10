import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { baristaTrustedDevices } from './barista.js';
import { cafes, drinks } from './cafes.js';
import { creditLedgerEntries } from './memberships.js';
import { users } from './users.js';

/**
 * A member's single-use, five-minute redemption code (PRD Module 8,
 * docs/architecture/redemption.md, ADR-0006). Ephemeral by design: this row
 * tracks the code's lifecycle only (`pending` -> `redeemed`, or `pending`
 * -> `canceled` when a newer code supersedes it — "a member may hold only
 * one live code at a time"). The durable financial record of a *completed*
 * redemption lives in `redemptions` below, inserted in the same transaction
 * that flips this row to `redeemed` (ADR-0006's atomic conditional UPDATE).
 *
 * `codeHash`/`backupCodeHash` store only a SHA-256 hash
 * (`apps/api/src/lib/tokens.ts`) — the raw code and backup code are
 * returned to the member once and never persisted or logged in plaintext.
 * `creditPrice` snapshots the drink's credit cost at the moment the code
 * was generated (the price the member was quoted on confirming) — this is
 * what gets deducted at redemption, never a live re-read of
 * `drinks.creditPrice`, so an admin price change can't affect a code
 * already in a member's hand.
 *
 * `expires_at > now()` is checked directly in the redemption query itself
 * (ADR-0006) — a code is never treated as valid just because a background
 * cleanup job hasn't run yet. `status` therefore never needs an `'expired'`
 * value of its own: an unscanned code past `expiresAt` is simply a
 * `pending` row the validation query will never match again. The
 * never-scanned cleanup job (PRD Module 1.2) is deferred infrastructure
 * work (see docs/architecture/infrastructure.md) — table hygiene, not a
 * correctness dependency.
 */
export const redemptionCodes = pgTable(
  'redemption_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cafeId: uuid('cafe_id')
      .notNull()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    drinkId: uuid('drink_id')
      .notNull()
      .references(() => drinks.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    backupCodeHash: text('backup_code_hash').notNull().unique(),
    creditPrice: integer('credit_price').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('redemption_codes_user_id_idx').on(table.userId),
    cafeIdIdx: index('redemption_codes_cafe_id_idx').on(table.cafeId),
    statusCheck: check(
      'redemption_codes_status_check',
      sql`${table.status} in ('pending', 'redeemed', 'canceled')`,
    ),
    creditPricePositive: check(
      'redemption_codes_credit_price_positive',
      sql`${table.creditPrice} > 0`,
    ),
  }),
);

/**
 * The durable, audited record of a *completed* redemption (PRD Module 7.5,
 * 8, 9; docs/architecture/database-architecture.md's "non-negotiable
 * rules"). Inserted exactly once, inside the same transaction that
 * atomically transitions the code to `redeemed` and inserts the negative
 * `credit_ledger_entries` row it references — see
 * `apps/api/src/services/baristaService.ts`. `payoutRateCents` is the
 * cafe's payout rate *at the moment of the scan*, copied here so a later
 * admin change to the cafe's rate (Phase 6) never rewrites a past
 * redemption's value — never a live join to `cafe_barista_credentials`.
 *
 * No update/delete path exists on this table in this phase: a Phase 6 void
 * is a new, separate, audited reversing ledger entry (root CLAUDE.md,
 * database-architecture.md rule 4) referencing this row, not a mutation of
 * it — this table's immutability is what that future feature depends on.
 */
export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    redemptionCodeId: uuid('redemption_code_id')
      .notNull()
      .unique()
      .references(() => redemptionCodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cafeId: uuid('cafe_id')
      .notNull()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    drinkId: uuid('drink_id')
      .notNull()
      .references(() => drinks.id, { onDelete: 'cascade' }),
    creditLedgerEntryId: uuid('credit_ledger_entry_id')
      .notNull()
      .unique()
      .references(() => creditLedgerEntries.id, { onDelete: 'cascade' }),
    baristaTrustedDeviceId: uuid('barista_trusted_device_id')
      .notNull()
      .references(() => baristaTrustedDevices.id, { onDelete: 'cascade' }),
    creditAmount: integer('credit_amount').notNull(),
    payoutRateCents: integer('payout_rate_cents').notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('redemptions_user_id_idx').on(table.userId),
    cafeIdIdx: index('redemptions_cafe_id_idx').on(table.cafeId),
    redeemedAtIdx: index('redemptions_redeemed_at_idx').on(table.redeemedAt),
    creditAmountPositive: check(
      'redemptions_credit_amount_positive',
      sql`${table.creditAmount} > 0`,
    ),
  }),
);
