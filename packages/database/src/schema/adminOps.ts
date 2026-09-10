import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { cafes } from './cafes.js';
import { creditLedgerEntries } from './memberships.js';
import { redemptions } from './redemptions.js';
import { users } from './users.js';

/**
 * The audited record of an admin voiding a redemption (PRD 9.7 / Module 9:
 * "void a redemption (restores the member's credits, removes it from the
 * cafe's payout), with every void recorded (who + reason)").
 *
 * Deliberately a separate table from `redemptions` rather than status/void
 * columns added to it — `redemptions` stays a row that is never updated
 * after insert (docs/architecture/database-architecture.md rule 4), and a
 * void is instead a new row that references it. `redemptionId` is unique,
 * which is also the concurrency guard: `adminRedemptionService.void` first
 * inserts the compensating `credit_ledger_entries` row, then attempts this
 * insert — a concurrent second void attempt hits the unique constraint,
 * fails, and rolls its whole transaction back (including its ledger
 * insert), so a redemption can never be voided twice and credits can never
 * be double-compensated (same "let the database prove it" approach as
 * ADR-0006, generalized to a plain unique-insert instead of a conditional
 * UPDATE, since there is no pre-existing row to conditionally transition).
 */
export const redemptionVoids = pgTable(
  'redemption_voids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    redemptionId: uuid('redemption_id')
      .notNull()
      .unique()
      .references(() => redemptions.id, { onDelete: 'cascade' }),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    creditLedgerEntryId: uuid('credit_ledger_entry_id')
      .notNull()
      .unique()
      .references(() => creditLedgerEntries.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reasonLength: check(
      'redemption_voids_reason_length',
      sql`char_length(${table.reason}) between 1 and 500`,
    ),
  }),
);

/**
 * An admin-recorded cafe payout payment (PRD Module 9 Payouts: "record a
 * payment (amount, date, reference) once the bank transfer is made").
 * Operational record only — inserting a row here does not move any money;
 * it documents that a bank transfer already happened outside the system
 * (see docs/architecture/payments.md's Stripe boundary — this has nothing to
 * do with Stripe, which only ever bills members, never pays cafes).
 *
 * The amount owed for a period is always computed live from `redemptions`
 * (`creditAmount * payoutRateCents`, both already snapshotted at redemption
 * time — never recalculated from a cafe's *current* rate), not stored here
 * and not decremented — "amount owed resets for next period" falls out of
 * scoping every payout query to a chosen `[periodStart, periodEnd)`, and
 * "full history retained" falls out of this table never being deleted or
 * updated, only appended to.
 */
export const cafePayoutPayments = pgTable(
  'cafe_payout_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cafeId: uuid('cafe_id')
      .notNull()
      .references(() => cafes.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    reference: text('reference'),
    recordedByAdminId: uuid('recorded_by_admin_id')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cafePeriodIdx: index('cafe_payout_payments_cafe_period_idx').on(
      table.cafeId,
      table.periodStart,
      table.periodEnd,
    ),
    amountPositive: check('cafe_payout_payments_amount_positive', sql`${table.amountCents} > 0`),
  }),
);

/**
 * The smallest reusable audit trail for admin mutations that CLAUDE.md calls
 * out by name (payout rate changes, PIN changes, cafe changes, drink pricing
 * changes, member deactivation) — deliberately not a general event-sourcing
 * system, and deliberately not the audit record for voids or recorded
 * payments, which already carry their own admin/reason fields inline
 * (`redemption_voids.adminUserId`/`reason`, `cafe_payout_payments.recordedByAdminId`)
 * and would just duplicate this table if also written here.
 *
 * `metadata` is a small jsonb blob of non-secret before/after context (e.g.
 * `{ field: 'name', from: 'Old Name', to: 'New Name' }`) — never a PIN, a
 * token, or a password hash.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('admin_audit_log_entity_idx').on(table.entityType, table.entityId),
    adminIdx: index('admin_audit_log_admin_created_idx').on(table.adminUserId, table.createdAt),
  }),
);
