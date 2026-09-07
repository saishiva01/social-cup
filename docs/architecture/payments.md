# Payments Architecture

## Status

No Stripe integration exists yet (see [docs/development/phases.md](../development/phases.md)).
This document defines the design that integration must follow.

## What the PRD specifies (Module 7)

- One plan: $24.99/month, 30 drink credits, no rollover.
- Checkout happens **inside the mobile app** via Stripe's native payment sheet (Apple Pay, Google
  Pay, card in one sheet) — not a redirect to a web browser, and not Apple's In-App Purchase
  (justified under Apple guideline 3.1.5(a) for physical goods consumed outside the app; see
  Module 7.6 and [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback)
  for the review-rejection contingency — resolved by
  [ADR-0010](../adr/0010-apple-review-fallback-deferred.md): build only this Stripe PaymentSheet
  flow in Phase 1, no proactive Apple IAP or Stripe-Checkout-web fallback).
- Cancellation and card updates happen through a Stripe-hosted page opened from the app (Stripe
  Customer Portal), not a custom-built UI.
- Stripe sends the receipt, renewal notice, and payment-failure email directly — Social Cup does
  not re-implement billing emails.
- Credits are granted **only** when Stripe confirms a payment — never optimistically on the
  client tapping "subscribe."

## Design: webhook-driven state, not client-confirms-and-tells-the-server

The backend's view of "is this person a Member, and how many credits do they have" is driven
entirely by Stripe webhook events (`checkout.session.completed` / `invoice.paid` for renewals,
`invoice.payment_failed`, `customer.subscription.deleted`, etc.), verified with the webhook
signing secret — **not** by the mobile app calling an endpoint after the Stripe SDK reports
success on-device. The client-side payment sheet confirming a charge is necessary for the
member's own UX (immediate feedback) but is never sufficient, on its own, to grant credits or
flip account state; only the corresponding verified webhook does that.

This matters for two reasons:

1. **It's the only way to keep the credit balance server-authoritative** (see the financial rules
   in the root [CLAUDE.md](../../CLAUDE.md)) — a compromised or modified mobile client cannot
   grant itself credits by lying about payment success, because the server never takes the
   client's word for it.
2. **It keeps a second checkout entry point cheap if it's ever needed.** If Apple ever rejects
   the in-app-checkout approach (the PRD's own noted risk — see
   [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback)),
   the fallback is a Stripe Checkout web page instead of the native payment sheet. Because credit
   granting is driven by the _webhook_, not by which UI collected the payment, adding that
   fallback would mean adding a new checkout entry point, not rebuilding the entitlement logic.
   Per [ADR-0010](../adr/0010-apple-review-fallback-deferred.md), that fallback is not built
   proactively in Phase 1 — this webhook design just keeps it cheap to add later, if an actual
   rejection ever makes it necessary.

## Express/webhook implementation constraint

Stripe webhook signature verification (`stripe.webhooks.constructEvent`) requires the **raw,
unparsed request body** — it will fail if `express.json()` has already parsed and re-serialized
it. The webhook route must be mounted with `express.raw({ type: 'application/json' })` scoped to
just that route, and mounted _before_ the global `express.json()` middleware in `apps/api/src/app.ts`
(or on a path `express.json()` explicitly skips). This is a common integration mistake worth
calling out before the route exists, not after debugging a signature-verification failure in
production.

## Idempotency

Stripe can (and does) redeliver the same webhook event more than once. Every webhook handler must
be idempotent — e.g. record the Stripe event id and skip processing if it's already been applied
— so a redelivered `invoice.paid` event does not grant 30 credits twice. This is the same class
of correctness problem as redemption double-scanning (see
[docs/architecture/redemption.md](redemption.md)): money-moving code gets it right by construction
(unique constraint / idempotency key), not by hoping the event only arrives once.

## Cafe payout rate vs. subscription billing

Cafe payouts (PRD Module 9.8) are a separate concern from Stripe subscription billing — cafes are
paid by the Social Cup team via manual bank transfer, recorded in the admin panel, not through
Stripe Connect or any automated payout rail (explicitly Out of Scope, PRD Section 3). Nothing in
this payments architecture assumes Stripe Connect exists.

## What's explicitly deferred

- Credit top-up purchases mid-cycle (Out of Scope, Phase 2).
- Multiple plans/tiers — the schema and billing logic should not go out of their way to prevent
  this later, but building for it now would be speculative (PRD: exactly one plan).
- Automated cafe payouts via Stripe Connect (Out of Scope, Phase 2 — "Automated bank payouts to
  cafes").
