# ADR-0005: Subscription/credit state is driven by verified Stripe webhooks, never by client confirmation

## Status

Accepted and implemented (Phase 4 — PRD Module 7). See
[ADR-0011](0011-stripe-webhook-events-and-idempotency.md) for the exact event list actually
implemented (Social Cup uses the Subscriptions API + native PaymentSheet, not Stripe Checkout, so
there is no `checkout.session.completed` in the final event list below) and the transactional
idempotency pattern.

## Context

The mobile app collects payment via Stripe's native payment sheet (PRD Module 7.2). Once the
Stripe SDK reports success on-device, the app could theoretically call an API endpoint saying
"I paid, grant my credits" — this is the simplest possible implementation and the most common
mistake in DIY subscription integrations, because it makes the credit grant trust the client's
report of what happened in a third-party SDK the server never directly observed.

## Decision

`apps/api` grants credits and updates account state (Visitor → Member, renewal resets,
deactivation on payment failure) **only** in response to verified Stripe webhook events
(`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.deleted`, signature-verified with the webhook signing secret). The
client-side payment sheet confirming success is used only for immediate UI feedback ("payment
processing...") — it never itself triggers a credit grant or state change.

Each webhook handler is idempotent (keyed on Stripe's event id) since Stripe redelivers events —
see [docs/architecture/payments.md](../architecture/payments.md).

## Consequences

- **A modified or compromised mobile client cannot grant itself credits.** The attack surface for
  "fake a successful payment" is Stripe's own signed webhook payload and signing secret, not
  anything the mobile app sends — consistent with the server-authoritative financial rules in the
  root [CLAUDE.md](../../CLAUDE.md).
- There is an unavoidable delay between "Stripe confirms the charge to the device" and "the
  webhook arrives and credits are granted" (typically sub-second, but not zero and not
  guaranteed). The mobile UI should show a brief "activating your membership" state rather than
  assuming the grant is instantaneous with the payment-sheet callback.
- If a second checkout entry point is ever added (the Apple-rejection fallback discussed in
  [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback)),
  it plugs into the same webhook-driven grant logic — a new _way to pay_, not a new _way to
  become a Member_.
- Requires the webhook route to receive Stripe's raw request body for signature verification —
  see the Express body-parser ordering note in
  [docs/architecture/payments.md](../architecture/payments.md).
