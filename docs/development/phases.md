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
   Google/Apple sign-in are **UI placeholders only** (deferred — no OAuth credentials).
   Remaining Module 2 items deferred to later phases: account deletion (must cancel a Stripe
   subscription, so it ships with Phase 4) and in-app password change (not in PRD scope). The
   Dallas neighbourhood list the PRD references is unresolved — see
   [open-questions.md](../decisions/open-questions.md).
2. **Module 9 (partial) — Cafe/drink schema and admin CRUD**, enough to seed real cafes before
   discovery has anything to show. Resolve
   [open-questions.md #4](../decisions/open-questions.md#4-cafe-vibe-tags--free-text-or-a-fixed-taxonomy)
   before building the cafe form.
3. **Modules 3–4 — Shop Discovery and Shop Detail Pages.**
4. **Module 5 — Drink Ratings and Drink Diary.**
5. **Module 6 — Curated Discovery** (depends on the featured/signature flags from Module 9).
6. **Module 7 — Membership and Credits**, implementing
   [docs/architecture/payments.md](../architecture/payments.md). The credit-value question the
   PRD left ambiguous between Modules 7.1 and 9.2 is now resolved — see
   [ADR-0009](../adr/0009-fixed-credit-value.md) and
   [open-questions.md #2](../decisions/open-questions.md#2-is-the-1-per-credit-rate-a-fixed-platform-constant-or-an-admin-editable-setting):
   fixed at $1/credit, not admin-configurable, no rate-history schema needed. The Apple
   review-rejection fallback question is also resolved — see
   [ADR-0010](../adr/0010-apple-review-fallback-deferred.md) and
   [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback):
   build only the Stripe PaymentSheet architecture; do not build Apple IAP/StoreKit or the
   Stripe-Checkout-web fallback proactively.
7. **Module 8 — Redemption and Barista Validation**, implementing
   [docs/architecture/redemption.md](../architecture/redemption.md) exactly — this is the module
   with the least tolerance for scope-cutting under time pressure; the concurrency tests in
   Module 10.1 gate it, not a demo passing once.
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
