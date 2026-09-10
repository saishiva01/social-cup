import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './users.js';

/**
 * Membership/subscription state (PRD Module 7, ADR-0005, ADR-0009, ADR-0010).
 * One row per user, created the first time they initiate a subscription (so a
 * Visitor who never subscribes has no row here at all — see
 * domain/entitlements.ts in apps/api, which treats "no row" as Visitor).
 * `status` is normalized from Stripe's richer subscription status set down to
 * the four states the product actually distinguishes (PRD 7.3/7.4); the raw
 * Stripe object is never copied wholesale into Postgres. Membership becoming
 * Member/redeem-eligible is driven exclusively by webhook-verified events —
 * this table is written only by apps/api/src/services/stripeWebhookService.ts
 * (plus the initial row insert when a Stripe customer is first created).
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    status: text('status').notNull().default('incomplete'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('memberships_status_idx').on(table.status),
    statusCheck: check(
      'memberships_status_check',
      sql`${table.status} in ('incomplete', 'active', 'past_due', 'canceled')`,
    ),
  }),
);

/**
 * Append-only credit ledger (ADR-0003). Phase 4 inserts `monthly_grant`
 * rows, driven by a verified `invoice.paid` webhook event; Phase 5 adds
 * `redemption` rows (negative `amount`), inserted by
 * `apps/api/src/services/baristaService.ts` in the same transaction as the
 * redemption-code consumption (ADR-0006) — never deducted, adjusted, or
 * reset-in-place otherwise (Phase 6's admin void remains an additive future
 * `reason` value on this same table, not a schema change).
 *
 * `stripeInvoiceId` is the idempotency key for a grant: a unique index means
 * a redelivered webhook for the same invoice can attempt this insert as many
 * times as Stripe likes and only the first ever lands (defense in depth on
 * top of the event-level idempotency in `stripe_webhook_events` — see
 * apps/api/src/services/stripeWebhookService.ts). `periodStart`/`periodEnd`
 * are copied from the Stripe invoice line item at grant time so "current
 * balance" can be derived as the sum of entries for the membership's current
 * billing period, which is what makes "no rollover" fall out of the query
 * rather than needing a separate reset-to-30 entry every cycle.
 *
 * Phase 6 adds `'redemption_void'`: the compensating credit for an admin
 * void (PRD 9.7/Module 9 redemption log — "void a redemption, restores the
 * member's credits"), inserted by `adminRedemptionService.void` in the same
 * transaction as the new `redemption_voids` row. It is written against the
 * *current* membership period (like a `'redemption'` deduction always is —
 * see baristaService.redeem), not the original redemption's period, so a
 * void actually restores usable balance now rather than landing in a
 * billing cycle that has already closed.
 */
export const creditLedgerEntries = pgTable(
  'credit_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    stripeInvoiceId: text('stripe_invoice_id').unique(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userPeriodIdx: index('credit_ledger_entries_user_period_idx').on(table.userId, table.periodEnd),
    amountNonZero: check('credit_ledger_entries_amount_nonzero', sql`${table.amount} <> 0`),
    reasonCheck: check(
      'credit_ledger_entries_reason_check',
      sql`${table.reason} in ('monthly_grant', 'redemption', 'redemption_void')`,
    ),
  }),
);

/**
 * Stripe webhook event idempotency record (ADR-0005, docs/architecture/payments.md).
 * `stripeEventId` as the primary key is the actual enforcement mechanism: the
 * webhook handler inserts this row and performs every state change caused by
 * the event in the same database transaction (see stripeWebhookService), so
 * either the whole thing commits together or none of it does — a redelivered
 * event either finds this row already committed (no-op, already fully
 * processed) or finds nothing (the previous attempt failed before committing
 * and it is safe, and necessary, to reprocess from scratch).
 */
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
