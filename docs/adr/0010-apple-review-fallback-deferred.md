# ADR-0010: Apple App Store review fallback is deferred, not built speculatively, in Phase 1

## Status

Accepted. This is a **confirmed product decision**, not an engineering choice — it resolves
[open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback).
Not yet implemented (Phase 1, Module 7 — see [docs/development/phases.md](../development/phases.md)).
Does not modify or reinterpret [ADR-0008](0008-visitor-member-account-states.md) or
[ADR-0009](0009-fixed-credit-value.md), both of which remain unchanged.

## Context

PRD Module 7.6 (App Store compliance) specifies that membership is sold **inside the app via
Stripe's native payment sheet** (Apple Pay, Google Pay, card in one native sheet), not Apple's
In-App Purchase / StoreKit, justified under Apple guideline 3.1.5(a) (a payment method other than
in-app purchase is permitted for physical goods/services consumed outside the app — here, drinks
redeemed at a physical cafe counter). The PRD includes its own contingency note: _"if Apple's
review team rejects this despite the above, the alternative is a Stripe Checkout page on the
Social Cup website, opened from the app"_ — and states plainly that this alternative is _"not
included in this proposal,"_ scoping it separately at roughly 10–12 hours.

This left open whether Social Cup should build the Apple In-App Purchase (StoreKit) integration,
or the Stripe-Checkout-web fallback, or both, proactively during Phase 1 as insurance against a
possible App Store review rejection — versus building only the PRD's primary Stripe-payment-sheet
design and treating a rejection as a future problem to solve if and when it actually occurs.

Building a second payment architecture on spec would mean: an Apple StoreKit subscription
integration (server-side receipt validation, StoreKit-to-Stripe-entitlement reconciliation) or a
Stripe-Checkout-web entry point, maintained in parallel with the PRD's primary Stripe
PaymentSheet flow, for a review outcome that may never happen and that the PRD itself did not
scope or budget for in Phase 1.

## Decision

**Social Cup builds the PRD's specified payment architecture only. No Apple-rejection fallback is
built proactively in Phase 1.**

Concretely, for Phase 1:

- Stripe subscriptions, Stripe's native PaymentSheet (Apple Pay, Google Pay, card in one sheet),
  and Stripe webhook-driven subscription/payment state (per
  [docs/architecture/payments.md](../architecture/payments.md) and
  [ADR-0005](0005-webhook-driven-payments.md)) are implemented exactly as the PRD specifies.
  Stripe-hosted pages remain available for the PRD-specified cancellation/card-update flow
  (Module 7, Customer Portal).
- Apple In-App Purchase / StoreKit is **not** implemented proactively. Social Cup does not build a
  second subscription/entitlement system as precaution against a possible review rejection that
  has not occurred.
- The Stripe-Checkout-web fallback the PRD itself notes (and explicitly excludes from its own
  scope) is likewise **not** built proactively in Phase 1.
- If Apple App Store review actually rejects or requires changes to the in-app Stripe
  PaymentSheet flow, that is handled as a **separate, new product/architecture decision at that
  time** — with its own ADR — not as something inferred or pre-built from this decision.

This decision does **not** declare Apple IAP impossible or permanently prohibited — only that
Social Cup will not build speculative fallback payment infrastructure before it is actually
required. [docs/architecture/payments.md](../architecture/payments.md)'s webhook-driven design
(crediting is driven by the verified Stripe webhook, not by which UI collected the payment) is
already structured so that _if_ a fallback is ever commissioned, it adds a new checkout entry
point rather than requiring the entitlement logic to be rebuilt — that architectural readiness is
unchanged by this ADR; only the decision to build the fallback now is what this ADR settles.

## Consequences

- **No StoreKit/Apple IAP integration is implemented in Phase 1.** No server-side receipt
  validation, no App Store Server Notifications handling, no StoreKit-to-entitlement
  reconciliation logic.
- **No Stripe-Checkout-web fallback entry point is implemented in Phase 1**, despite the PRD
  noting it as a possible future addition — it remains explicitly out of the PRD's own Phase 1
  scope, consistent with the PRD's ~10–12-hour separate-change-request framing.
- **A future Apple rejection is a new decision, not a standing contingency plan to execute.** If
  App Store review requires a different payment mechanism, Engineering and Product make that call
  when it happens, informed by the actual review feedback, and record it as its own ADR before any
  implementation begins.
- This decision is about **product/engineering sequencing** only. It does not itself authorize
  implementing Stripe, PaymentSheet, subscriptions, or any payment schema — that remains Phase 1
  Module 7 work, gated by the phase boundaries in the root [CLAUDE.md](../../CLAUDE.md).
- No other open question is affected or resolved by this ADR. In particular,
  [open-questions.md #4](../decisions/open-questions.md#4-cafe-vibe-tags--free-text-or-a-fixed-taxonomy)
  remains open, and [ADR-0008](0008-visitor-member-account-states.md) and
  [ADR-0009](0009-fixed-credit-value.md) are unchanged by this decision.

## PRD reference

- Module 7.2 — Stripe native payment sheet as the primary, in-app checkout method.
- Module 7.6 (App Store compliance) — the 3.1.5(a) justification and the PRD's own noted
  Stripe-Checkout-web fallback, explicitly excluded from the proposal's scope.
- [docs/architecture/payments.md](../architecture/payments.md) — the webhook-driven design that
  keeps a future fallback cheap to add without rebuilding entitlement logic.
