# Payments Architecture

## Status

**Implemented (Phase 4).** Stripe customer/subscription creation, the native PaymentSheet flow,
the webhook handler, the membership/credit-ledger schema, and the membership API are built — see
`apps/api/src/services/stripe/`, `apps/api/src/services/membershipService.ts`,
`apps/api/src/services/stripeWebhookService.ts`, `apps/api/src/routes/v1/membership.ts`,
`apps/api/src/routes/stripeWebhook.ts`, `packages/database/src/schema/memberships.ts`, and
`apps/mobile/src/app/membership.tsx`. The rest of this document describes both the design and,
where noted, exactly how it was implemented.

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
entirely by Stripe webhook events, verified with the webhook signing secret — **not** by the
mobile app calling an endpoint after the Stripe SDK reports success on-device. The exact events
handled (`customer.subscription.created`/`updated`/`deleted`, `invoice.paid`,
`invoice.payment_failed` — no `checkout.session.completed`, since Social Cup uses the
Subscriptions API + native PaymentSheet rather than Stripe Checkout) and the transactional
idempotency pattern are in [ADR-0011](../adr/0011-stripe-webhook-events-and-idempotency.md). The client-side payment sheet confirming a charge is necessary for the
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
it. **As implemented:** `POST /api/v1/webhooks/stripe` is registered directly on the Express `app`
in `apps/api/src/app.ts` with `express.raw({ type: 'application/json' })` scoped to just that
route, mounted _before_ `app.use(express.json())` — it is deliberately not nested inside
`createV1Router`, so the ordering can't accidentally be broken by reshuffling the versioned router.

## Idempotency

Stripe can (and does) redeliver the same webhook event more than once. Every webhook handler must
be idempotent — e.g. record the Stripe event id and skip processing if it's already been applied
— so a redelivered `invoice.paid` event does not grant 30 credits twice. This is the same class
of correctness problem as redemption double-scanning (see
[docs/architecture/redemption.md](redemption.md)): money-moving code gets it right by construction
(unique constraint / idempotency key), not by hoping the event only arrives once. **As
implemented:** see [ADR-0011](../adr/0011-stripe-webhook-events-and-idempotency.md) — the
idempotency claim and every state change the event causes happen in one database transaction, so
a failure partway through rolls back the claim too and a retried delivery reprocesses cleanly
rather than being silently swallowed.

## Local Stripe development

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run `stripe login` once.
2. `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe` — copy the `whsec_...` value
   it prints into `apps/api/.env`'s `STRIPE_WEBHOOK_SECRET`. Keep this running while testing
   locally; it forwards real Stripe test-mode events to your local API.
3. Create a test-mode product/price in the [Stripe Dashboard](https://dashboard.stripe.com/test/products)
   ($24.99/month, recurring) and put its price id in `STRIPE_PRICE_ID`.
4. Use Stripe's [test card numbers](https://docs.stripe.com/testing#cards) in the mobile
   PaymentSheet (e.g. `4242 4242 4242 4242` for a guaranteed success, `4000 0000 0000 0002` for a
   guaranteed decline) — never a real card, even in a local/dev Stripe account.
5. `stripe trigger invoice.payment_failed` (or replay an event from the Dashboard) to test the
   failure path without waiting for a real card decline to propagate.

Automated tests never call real Stripe endpoints or the Stripe CLI — see
`apps/api/src/__tests__/helpers/fakeStripeService.ts`, which fakes every network-calling method
but delegates signature verification to the real `stripe` package's local (non-network)
`webhooks.constructEvent`/`generateTestHeaderString`, so signature tests exercise real crypto.

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
