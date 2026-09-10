# Development Phases

## Phase 0 — Engineering Foundation (this work)

Monorepo, tooling, the four app shells, the shared packages, the API foundation
(env validation, health/readiness, error handling, logging, CORS, security headers, rate
limiting, versioning, graceful shutdown), the database connection/migration workflow (no
product schema), Terraform infrastructure for three environments, and this documentation set.
No product feature — no auth screen, no cafe list, no rating, no membership, no Stripe, no
credits, no redemption, no admin CRUD, no barista scanning. See the root
[CLAUDE.md](../../CLAUDE.md) "Prohibited in this phase" list, which is the authoritative,
enforceable version of this boundary.

## Phase 1 — Product build (PRD Modules 1–10)

Everything In Scope in [docs/product/prd.md](../product/prd.md) Section 3. Suggested build
order, following the PRD's own module dependency order (each module's UI/API generally depends
on the previous one's data existing):

1. **Module 2 — Onboarding and Authentication.** Implements
   [docs/architecture/authentication.md](../architecture/authentication.md). The Visitor/Member
   account-state question the PRD asked to have confirmed before this module is now resolved —
   see [ADR-0008](../adr/0008-visitor-member-account-states.md) and
   [open-questions.md #1](../decisions/open-questions.md#1-can-a-visitor-browse-search-and-rate-without-ever-subscribing).
   **Status: substantially implemented (email/password MVP).** Email+password registration,
   link-based email verification (24h), login, logout with chain revocation, rotated refresh
   tokens, forgot/reset password (1h), profile/preferences/neighbourhood, rate limiting, and
   the Visitor/Member authorization seam all exist (`/api/v1/auth/*`, `/api/v1/me`;
   `apps/api/src/services/authService.ts`; mobile auth screens under `apps/mobile/src/app/`).
   Verification/reset emails link to real HTTPS pages (`apps/web`, a new small public web app —
   see [docs/architecture/authentication.md](../architecture/authentication.md)), sent via
   Resend in staging/production and local MailDev in development. Google/Apple sign-in are **UI
   placeholders only** (deferred — no OAuth credentials).
   Remaining Module 2 items deferred to later phases: account deletion (must cancel a Stripe
   subscription, so it ships with Phase 4) and in-app password change (not in PRD scope). The
   Dallas neighbourhood list the PRD references is unresolved — see
   [open-questions.md](../decisions/open-questions.md).
2. **Module 9 (partial) — Cafe/drink schema and admin CRUD**, enough to seed real cafes before
   discovery has anything to show. Resolve
   [open-questions.md #4](../decisions/open-questions.md#4-cafe-vibe-tags--free-text-or-a-fixed-taxonomy)
   before building the cafe form.
3. **Modules 3–4 — Shop Discovery and Shop Detail Pages.**
4. **Module 5 — Drink Ratings and Drink Diary.** **Status: implemented.** 1–5 star ratings with
   an optional 140-character note, one rating per member per drink (editable at any time, not
   deletable — the PRD only ever says "editable"), Visitor-accessible with no membership check
   (ADR-0008). A rating IS the diary entry — no separate diary schema. Drink and cafe average
   rating + count are server-derived and surfaced on cafe discovery/detail
   (`packages/database/src/schema/ratings.ts`; `apps/api/src/services/ratingService.ts`,
   `apps/api/src/domain/ratingAggregates.ts`; `PUT/GET /api/v1/drinks/:drinkId/rating`,
   `GET /api/v1/me/ratings`; `apps/mobile/src/app/rate/[drinkId].tsx`,
   `apps/mobile/src/app/diary.tsx`). The cafe-aggregate calculation method (average of all
   individual ratings vs. average of each drink's own average) is an interim reading of an
   ambiguous PRD sentence — see
   [open-questions.md #8](../decisions/open-questions.md#8-drink-and-cafe-rating-details-not-specified-by-the-prd).
5. **Module 6 — Curated Discovery** (depends on the featured/signature flags from Module 9).
6. **Module 7 — Membership and Credits**, implementing
   [docs/architecture/payments.md](../architecture/payments.md). **Status: implemented.** Stripe
   customer + subscription creation via the Subscriptions API (native PaymentSheet, not Stripe
   Checkout), webhook-driven membership/credit state (`customer.subscription.*`, `invoice.paid`,
   `invoice.payment_failed` — see [ADR-0011](../adr/0011-stripe-webhook-events-and-idempotency.md)
   for exactly which events and why), the append-only credit ledger, and the Stripe Billing
   Portal for cancellation/card updates all exist (`apps/api/src/services/membershipService.ts`,
   `stripeWebhookService.ts`, `services/stripe/`; `GET/POST /api/v1/membership*`,
   `POST /api/v1/webhooks/stripe`; `apps/mobile/src/app/membership.tsx`). The credit-value
   question the PRD left ambiguous between Modules 7.1 and 9.2 is resolved — see
   [ADR-0009](../adr/0009-fixed-credit-value.md) and
   [open-questions.md #2](../decisions/open-questions.md#2-is-the-1-per-credit-rate-a-fixed-platform-constant-or-an-admin-editable-setting):
   fixed at $1/credit, not admin-configurable, no rate-history schema needed. The Apple
   review-rejection fallback question is also resolved — see
   [ADR-0010](../adr/0010-apple-review-fallback-deferred.md) and
   [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback):
   only the Stripe PaymentSheet architecture is built; Apple IAP/StoreKit and the
   Stripe-Checkout-web fallback remain unbuilt, as decided. Redemption's account-state gate
   (`requireMembership` middleware, `domain/entitlements.ts`) now reads real membership state, and
   Module 8 (below) is where it is actually put to use — the mobile Redeem button opens the
   redemption flow for a Member with credits.
7. **Module 8 — Redemption and Barista Validation**, implementing
   [docs/architecture/redemption.md](../architecture/redemption.md) exactly — this is the module
   with the least tolerance for scope-cutting under time pressure; the concurrency tests in
   Module 10.1 gate it, not a demo passing once. **Status: implemented (Phase 5).** The five-minute
   single-use code (primary + six-digit backup), the "one live code at a time" rule, the
   PIN-authenticated cafe-scoped barista session (httpOnly trusted-device cookie, no barista user
   account), and the atomic conditional-UPDATE redemption transaction (ADR-0006) — consuming the
   code, deducting credits via a new `credit_ledger_entries` row, and writing the durable
   `redemptions` record with the payout rate snapshotted at scan time — all exist
   (`apps/api/src/services/{redemptionService,baristaService}.ts`;
   `POST/GET /api/v1/redemptions*`, `POST /api/v1/barista/{authenticate,redeem}`,
   `GET /api/v1/barista/today`; `apps/mobile/src/app/redeem/[drinkId].tsx`; `apps/barista/src/`).
   Camera/QR scanning is not implemented — manual code entry only, by deliberate scope cut, not a
   correctness gap (see [docs/architecture/redemption.md](../architecture/redemption.md), "What's
   explicitly deferred"). Concurrency/expiry/replay/cafe-binding/credit-ledger integration tests
   exist against a real Postgres instance
   (`apps/api/src/__tests__/{redemptions,barista}.integration.test.ts`), satisfying Module 10.1's
   requirement below. Two things this phase left open, not silently resolved: the cafe payout rate
   and PIN have no admin UI yet (Module 9, Phase 6) — `cafe_barista_credentials.payoutRateCents`
   is nullable and a redemption is refused at a cafe with none set, dev/test data seeded via
   `packages/database/src/seed.ts`; and the trusted-device duration is an undocumented-by-PRD
   90-day engineering default. See
   [docs/decisions/open-questions.md](../decisions/open-questions.md).
8. **Module 9 (remainder) — full Admin Panel** (redemption log, payouts, member management).
9. **Module 10 — QA, UAT, and Launch.**

## Phase 2 — Out of Scope (do not build without an explicit new decision)

Everything listed as Out of Scope in [docs/product/prd.md](../product/prd.md) Section 3:
self-service cafe portal, automated bank payouts, push notifications, analytics beyond CSV
export, activity-driven ranking, mid-cycle credit top-ups, order-ahead/collection, offline
scanning, and every social/connections feature (groups, activity feed, saved-cafe overlap,
meetup planning). A Stripe-Checkout-web fallback for membership signup remains deferred rather
than scheduled — it is built only if Apple App Store review actually requires it, as a separate,
new decision at that time, not proactively here. See
[ADR-0010](../adr/0010-apple-review-fallback-deferred.md) and
[open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback).

## Definition of done for a Phase 1 module

A module is done when: the endpoints/screens described in its PRD section exist and match the
account-state/role rules stated there; the concurrency/replay tests called for in Module 10.1
pass for anything touching the credit ledger or redemption; the module's data flows only through
`apps/api` (no client-side credit math, no client-trusted redemption result — see the financial
rules in the root [CLAUDE.md](../../CLAUDE.md)); and any ambiguity encountered was added to
[open-questions.md](../decisions/open-questions.md) rather than silently guessed.
