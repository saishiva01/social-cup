# ADR-0011: Stripe webhook event selection and the transactional idempotency pattern

## Status

Accepted and implemented (Phase 4 — PRD Module 7).

## Context

[ADR-0005](0005-webhook-driven-payments.md) already decided that membership/credit state is
webhook-driven, not client-confirmed, and named an illustrative event list
(`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.deleted`). Implementing it required three concrete decisions that
materially affect how Phase 5 (redemption) and Phase 6 (admin) can build on this foundation:
exactly which Stripe events to subscribe to, how to make each one idempotent under retry/failure
(not just "keyed on Stripe's event id" in the abstract), and how a credit balance that resets
monthly with no rollover ([ADR-0009](0009-fixed-credit-value.md)) is actually derived from an
append-only ledger ([ADR-0003](0003-credit-ledger-append-only.md)).

## Decision

### Which events

Social Cup sells the subscription through the Stripe Subscriptions API + native PaymentSheet
(`payment_behavior: default_incomplete`), not Stripe Checkout — so there is no
`checkout.session.completed` to handle, unlike ADR-0005's illustrative list. The handled set is:

| Event                           | Effect                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `customer.subscription.created` | Upserts `status`/period/`cancel_at_period_end` on the membership row. Never grants credits.     |
| `customer.subscription.updated` | Same as above — covers `cancel_at_period_end` toggling, reactivation, etc.                      |
| `customer.subscription.deleted` | Sets `status = 'canceled'`. Already-granted credits for the current period are not clawed back. |
| `invoice.paid`                  | The **only** event that grants credits — see below.                                             |
| `invoice.payment_failed`        | Sets `status = 'past_due'`. Grants nothing.                                                     |

`invoice.paid` was chosen over the older, functionally-overlapping `invoice.payment_succeeded`
(Stripe fires both for the same successful charge) to avoid reasoning about two events racing to
grant the same invoice's credits. The per-invoice unique constraint (below) would still prevent a
double grant if both were handled, but handling one is simpler to reason about and the PRD does
not require reacting to both.

Subscription events never grant credits, even when they report `status: active` — only a
verified `invoice.paid` does, per the rule that a subscription becoming active without a
corresponding successful payment must not grant credits. This also makes webhook **ordering**
safe to ignore: `invoice.paid` updates the membership's period fields itself rather than assuming
a prior `customer.subscription.*` event already set them, so out-of-order delivery (`invoice.paid`
arriving before `customer.subscription.created`, which Stripe does not guarantee against) still
produces the correct end state.

### Idempotency: one transaction, not a first-write-wins flag

`stripe_webhook_events` (`stripeEventId` primary key) is not just a dedup log checked before
processing — the claim insert and every state change the event causes (membership update, credit
ledger insert) happen inside the **same** database transaction
(`apps/api/src/services/stripeWebhookService.ts`). Two consequences:

- A **redelivered** event's claim insert conflicts (`ON CONFLICT DO NOTHING` returns no row) and
  the handler returns immediately — no reprocessing, no double grant.
- A **failed** event (any exception after the claim, for any reason) rolls back the entire
  transaction, including the claim row itself. The next delivery of the identical event sees no
  claim and reprocesses from scratch. This is what makes retry-after-failure safe: there is no
  window where an event is marked "handled" but only partially applied.

`credit_ledger_entries.stripeInvoiceId` carries its own unique constraint as defense in depth,
independent of the event-level claim — a second layer that would still stop a double grant even if
the event-level idempotency were ever bypassed (e.g. a future direct call into the grant path that
didn't go through `processEvent`).

### Deriving "current balance" without a reset entry

Every `monthly_grant` ledger row also stores the Stripe invoice line item's `periodStart`/`periodEnd`.
"Current credit balance" is `SUM(amount)` over ledger rows whose `periodEnd` matches the
membership's current `currentPeriodEnd` — not `SUM(amount)` over all time. Since Phase 4 has no
redemption deductions yet, this reduces to "the current period's one grant, or zero," and it is
what makes "no rollover" fall out of the query rather than needing an explicit
delta-back-to-30 `renewal_reset` entry (ADR-0003's illustrative reason enum) every cycle: a prior
period's unused grant simply is not part of the current period's sum. When Phase 5 adds redemption
deductions, they extend the same query (sum everything with the current `periodEnd`, not just
grants) without a schema change.

## Consequences

- Adding a Phase 2 fallback checkout entry point (Apple-rejection scenario,
  [ADR-0010](0010-apple-review-fallback-deferred.md)) still plugs into `invoice.paid` — nothing
  about event selection changes because a different UI collected the payment.
- A future admin credit adjustment or Phase 5 redemption deduction is a new `reason` value and a
  new code path inserting into `credit_ledger_entries` with the current period's `periodEnd` — no
  change to how balance is derived.
- The webhook route (`POST /api/v1/webhooks/stripe`) must stay mounted with `express.raw()` ahead
  of the global `express.json()` middleware in `apps/api/src/app.ts` — see
  [docs/architecture/payments.md](../architecture/payments.md).
