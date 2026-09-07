# Open Questions

Ambiguities and unresolved decisions found in the PRD (`SOCIAL_CUP_Proposal_Final 6.pdf`) or
introduced by this engineering-foundation work. **None of these have been silently resolved in
code or docs** — each needs a product-owner (or, where marked, an engineering-lead) decision
before the feature area it touches is built. Update this file — don't just fix the code — when
one is answered.

## Product / PRD ambiguities

### 1. Can a Visitor browse, search, and rate without ever subscribing?

**Status:** RESOLVED. Confirmed as the PRD's own assumption: **yes**. See
[ADR-0008](../adr/0008-visitor-member-account-states.md) for the full decision.

The PRD stated in Module 2.5 (Account States): _"This document assumes that registered users can
browse, search, and rate without subscribing, and that payment is required only in order to
redeem a drink. Please confirm before Module 7 is built."_

**Decision:** Subscription/payment gates redemption and credits only. A Visitor (registered, not
subscribed) can browse, search, filter, view cafes/menus/ratings, rate drinks, and maintain a
drink diary — identically to a Member. A Member additionally receives 30 credits per successful
monthly payment and can redeem. Neither "authenticated" nor "entitled to redeem" collapse into a
single check — they are two separate checks, as detailed in ADR-0008.

This assumption was already used consistently throughout the rest of the document (Visitor role
in Section 2, Module 3–6 all describe Visitor access to browse/search/rate) — the confirmation
changes nothing about those modules, it unblocks Module 7's account-state/authorization design.

**Owner:** Product. **Resolved.**

### 2. Is the $1-per-credit rate a fixed platform constant or an admin-editable setting?

**Status:** RESOLVED. Confirmed **fixed** for Phase 1: 1 credit = exactly $1, not
admin-configurable, no overrides, no variable denominations. See
[ADR-0009](../adr/0009-fixed-credit-value.md) for the full decision.

Module 7.1 states flatly: _"One credit is worth one dollar at any partner cafe"_ — read in
context as a fixed rule. Module 9.2 (Admin Panel → Settings) lists _"The credit value in dollars,
currently one credit equals one dollar"_ as a value shown in the Settings screen, which reads as
admin-editable.

**Decision:** Fixed. The Settings-screen field displays this value but does not accept edits in
Phase 1 — no credit-value history/audit schema is needed, and the value can live in application
config rather than the database. (The separate, already-unambiguous per-cafe _payout_ rate in
Module 7.5 is unaffected — it remains admin-editable per cafe and is already required to be
snapshotted per redemption.)

**Owner:** Product. **Resolved.** **Affects:** `packages/database` schema design when Module 7 is
built — no rate-history table needed as a result of this decision.

### 3. Apple in-app-purchase rejection fallback

**Status:** RESOLVED. Confirmed: build the PRD's specified Stripe PaymentSheet architecture only;
do **not** build an Apple IAP/StoreKit integration or the Stripe-Checkout-web fallback
proactively in Phase 1. See [ADR-0010](../adr/0010-apple-review-fallback-deferred.md) for the
full decision.

Module 7.6 sells the membership through Stripe's in-app payment sheet (not Apple IAP), citing
Apple guideline 3.1.5(a) (physical goods consumed outside the app). The PRD includes its own
contingency note: _if Apple's review team rejects this despite the guideline, the fallback is a
Stripe Checkout page on the Social Cup website, opened from the app — and that fallback is
explicitly "not included in this proposal,"_ scoped separately at ~10–12 hours.

**Decision:** Phase 1 implements Stripe subscriptions, Stripe PaymentSheet, and Stripe-hosted
pages (for cancellation/card updates) exactly as the PRD specifies. Social Cup does **not** build
Apple IAP/StoreKit, and does **not** build the Stripe-Checkout-web fallback, as speculative
precaution against a review rejection that hasn't happened. If Apple review actually rejects or
requires changes to the in-app flow, that is handled as a separate, new product/architecture
decision — with its own ADR — at that time, not pre-built now. This does not declare Apple IAP
impossible or permanently prohibited, only deferred until actually required.
[docs/architecture/payments.md](../architecture/payments.md)'s webhook-driven design (see
[ADR-0005](../adr/0005-webhook-driven-payments.md)) already keeps a future fallback cheap to add
without rebuilding entitlement logic — that architectural readiness is unaffected by this
decision.

**Owner:** Product/Business and Engineering. **Resolved.**

### 4. Cafe "vibe tags" — free text or a fixed taxonomy?

Module 3.2 shows cafe cards with "vibe tags, for example good for remote work" and Module 9.3
lets the administrator set them when adding a cafe. The PRD doesn't say whether these are
free-text, a curated fixed list, or an admin-managed open taxonomy. Doesn't block this phase;
affects the cafes/drinks schema when Module 9 is built.

**Owner:** Product (or Design, if Option A's design sprint produces a fixed tag set).

### 4a. The Dallas neighbourhood list for profile setup

PRD Module 2.2 says the home neighbourhood is chosen "from a set list of Dallas areas" and
Module 3.3 filters by "neighbourhood", but the PRD never enumerates the list. The Phase 1
schema therefore stores the neighbourhood as a validated free-text string
(`users.neighborhood`), and the profile screen accepts any value — the canonical list, once
provided, becomes a shared constant (e.g. in `packages/validation`) and a validation enum with
no schema change needed. The list also feeds the Module 3 neighbourhood filter.

**Owner:** Product (whoever knows the Dallas areas Social Cup will launch in).

### 4b. Email-verification expiry

PRD Module 2.2 says the password-reset link expires after one hour but states no expiry for
the signup verification link. `docs/architecture/authentication.md` treats it as 24 hours
unless the product specifies otherwise, and `apps/api/src/lib/tokens.ts` implements that
constant. If the product owner wants a different window, it is a one-line change.

**Owner:** Product. (Recorded for confirmation; the implementation uses 24h as documented.)

## Engineering-foundation decisions flagged for confirmation

### 5. Mobile app bundle identifier / Android package name

`apps/mobile/app.json` currently uses placeholder values (`com.socialcup.app` for both
`ios.bundleIdentifier` and `android.package`) because the PRD does not specify one. These values
are effectively permanent once an App Store Connect / Play Console listing is created against
them — confirm the real identifiers before that first submission.

**Owner:** Product/Business (whoever owns the Apple Developer and Google Play accounts).

### 6. Rate limit store for multi-instance deployment

`apps/api/src/middleware/rateLimit.ts` uses `express-rate-limit`'s default in-memory store. That
store's counters are per-process — correct for a single ECS task, but each task would enforce
its own separate limit once staging/production run more than one task behind the ALB (production
is configured for `desired_count = 2` in the Terraform foundation), which weakens the effective
limit roughly in proportion to task count and lets it drift further if tasks scale.

The stated tech stack has no shared cache (no ElastiCache/Redis, no equivalent). Options once
this matters: add a small Redis/ElastiCache instance and switch to a shared rate-limit store
(e.g. `rate-limit-redis`), or accept per-task limiting with a lower per-task threshold as a
deliberate tradeoff. Not decided here — flagging before production traffic depends on it.

**Owner:** Engineering lead.

### 7. Session/refresh token storage mechanism

The PRD specifies "secure tokens that refresh in the background" (Module 2.1) but not the
mechanism. `docs/architecture/authentication.md` documents the chosen approach (short-lived JWT
access token + opaque, rotated, server-side-hashed refresh token) as an engineering decision, not
a product requirement — recorded there and in
[ADR-0004](../adr/0004-authentication-token-strategy.md) rather than here, since it's a decision
this team is equipped to make, not one that needs a product owner. Listed here only as a pointer
so it isn't mistaken for a PRD requirement if it's ever revisited.

**Owner:** Engineering lead (already decided; revisit only if a concrete requirement conflicts
with it).

## PDF extraction issues (not ambiguities — noted for traceability)

The commercial sections (Section 6 engagement options, Section 7 project timeline/hours tables,
Section 8 team composition) suffered column-merge artifacts when the PDF was converted to text —
numbers and phrases from adjacent table columns interleaved. None of that content affects Phase 1
scope or any decision in this codebase, so it was not transcribed into
[docs/product/prd.md](../product/prd.md); refer to `SOCIAL_CUP_Proposal_Final 6.pdf` pages 12–15
directly if commercial detail is ever needed. Module 4.2's text had a similar artifact; see the
note inline in `docs/product/prd.md` Module 4.
