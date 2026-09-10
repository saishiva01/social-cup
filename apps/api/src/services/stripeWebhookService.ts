import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { logger } from '../lib/logger.js';
import { normalizeSubscriptionStatus, subscriptionPeriod } from './stripe/stripeMappers.js';

const { memberships, creditLedgerEntries, stripeWebhookEvents } = schema;

/** The transaction handle Drizzle passes into `db.transaction(async (tx) => ...)` — derived structurally so handlers don't need to import Drizzle's internal transaction type directly. */
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** ADR-0009: 1 credit = $1, fixed. 30 credits/month is a PRD constant, never derived from a Stripe amount the client or a webhook payload could influence. */
const MONTHLY_GRANT_CREDITS = 30;

/**
 * Stripe events this handler actually acts on (docs/architecture/payments.md).
 * Social Cup sells the subscription via the Subscriptions API + native
 * PaymentSheet, not Stripe Checkout, so there is no `checkout.session.completed`
 * to handle. `invoice.paid` (not the older, functionally-overlapping
 * `invoice.payment_succeeded`) is the one event that grants credits — see
 * handleInvoicePaid for why using both would be redundant, not just
 * differently idempotent.
 */
export const HANDLED_STRIPE_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

export interface StripeWebhookService {
  processEvent(event: Stripe.Event): Promise<void>;
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

/**
 * Webhook-driven membership/credit state (ADR-0005, ADR-0003). The single
 * entry point, `processEvent`, wraps the idempotency claim and every state
 * change the event causes in one database transaction: if anything after the
 * claim throws, the claim itself rolls back too, so a Stripe retry of the
 * same event id safely reprocesses from scratch rather than being silently
 * treated as already-done (docs/architecture/payments.md — "transaction
 * failures" in the idempotency requirements).
 */
export function createStripeWebhookService(deps: { db: DB }): StripeWebhookService {
  const { db } = deps;

  return {
    async processEvent(event) {
      await db.transaction(async (tx) => {
        // ON CONFLICT DO NOTHING, not try/catch: a duplicate delivery is an
        // expected, common case, not an exceptional error — this never puts
        // the transaction into an aborted state the way catching a thrown
        // unique-violation error inside an open transaction would.
        const [claimed] = await tx
          .insert(stripeWebhookEvents)
          .values({ stripeEventId: event.id, type: event.type })
          .onConflictDoNothing()
          .returning({ stripeEventId: stripeWebhookEvents.stripeEventId });

        if (!claimed) {
          logger.info(
            { stripeEventId: event.id, type: event.type },
            'Stripe webhook event already processed',
          );
          return;
        }

        switch (event.type) {
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            await handleSubscriptionUpdated(tx, event.data.object as Stripe.Subscription);
            break;
          case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(tx, event.data.object as Stripe.Subscription);
            break;
          case 'invoice.paid':
            await handleInvoicePaid(tx, event.data.object as Stripe.Invoice);
            break;
          case 'invoice.payment_failed':
            await handleInvoicePaymentFailed(tx, event.data.object as Stripe.Invoice);
            break;
          default:
            logger.debug(
              { stripeEventId: event.id, type: event.type },
              'Unhandled Stripe webhook event type',
            );
        }
      });
    },
  };
}

/**
 * Subscription lifecycle events update status/period/cancellation state only
 * — they never grant credits (rule: a subscription becoming active without a
 * corresponding successful payment must not grant credits). Out-of-order
 * delivery is safe: this is a plain upsert-by-customer, not dependent on any
 * other event having already run (docs/architecture/payments.md, "webhook
 * ordering").
 */
async function handleSubscriptionUpdated(tx: Tx, subscription: Stripe.Subscription): Promise<void> {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return;

  const { currentPeriodStart, currentPeriodEnd } = subscriptionPeriod(subscription);
  const result = await tx
    .update(memberships)
    .set({
      stripeSubscriptionId: subscription.id,
      status: normalizeSubscriptionStatus(subscription.status),
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(memberships.stripeCustomerId, customerId))
    .returning({ userId: memberships.userId });

  if (result.length === 0) {
    logger.warn(
      { stripeCustomerId: customerId, stripeSubscriptionId: subscription.id },
      'customer.subscription event for a Stripe customer with no local membership row',
    );
  }
}

async function handleSubscriptionDeleted(tx: Tx, subscription: Stripe.Subscription): Promise<void> {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return;

  await tx
    .update(memberships)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(memberships.stripeCustomerId, customerId));
}

/**
 * The one event that grants credits. Deliberately not `invoice.payment_succeeded`
 * too — Stripe fires both for the same successful charge, and handling only
 * `invoice.paid` avoids reasoning about two events racing for the same grant
 * (the per-invoice unique constraint on credit_ledger_entries would still
 * prevent a double grant even if both were handled, but one event is simpler
 * to reason about and there is no PRD requirement to react to both).
 */
async function handleInvoicePaid(tx: Tx, invoice: Stripe.Invoice): Promise<void> {
  if (
    invoice.billing_reason !== 'subscription_create' &&
    invoice.billing_reason !== 'subscription_cycle'
  ) {
    return; // not a subscription invoice (e.g. a one-off item) — not this product's billing model
  }

  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;

  const [membership] = await tx
    .select()
    .from(memberships)
    .where(eq(memberships.stripeCustomerId, customerId));
  if (!membership) {
    logger.error(
      { stripeCustomerId: customerId, stripeInvoiceId: invoice.id },
      'invoice.paid for a Stripe customer with no local membership row — credits not granted',
    );
    return;
  }

  const line = invoice.lines.data[0];
  if (!line) {
    logger.error(
      { stripeInvoiceId: invoice.id },
      'invoice.paid with no line items — cannot determine billing period',
    );
    return;
  }
  const periodStart = new Date(line.period.start * 1000);
  const periodEnd = new Date(line.period.end * 1000);

  await tx
    .update(memberships)
    .set({
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(memberships.id, membership.id));

  // Unique on stripeInvoiceId: defense in depth on top of the event-level
  // idempotency claim above — a duplicate grant for this invoice is a no-op,
  // not an error.
  await tx
    .insert(creditLedgerEntries)
    .values({
      userId: membership.userId,
      amount: MONTHLY_GRANT_CREDITS,
      reason: 'monthly_grant',
      stripeInvoiceId: invoice.id,
      periodStart,
      periodEnd,
    })
    .onConflictDoNothing();
}

async function handleInvoicePaymentFailed(tx: Tx, invoice: Stripe.Invoice): Promise<void> {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;

  await tx
    .update(memberships)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(memberships.stripeCustomerId, customerId));
}
