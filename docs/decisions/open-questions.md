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

**Implemented interim modeling (cafe discovery, Modules 3/4):** `cafes.vibeTags` is a `jsonb`
array of free-text strings (`packages/database/src/schema/cafes.ts`), the same treatment already
given to #4a below — no fixed taxonomy invented, promotable to an enum/admin-managed list later
with no schema change. This does not resolve the underlying product question.

**Owner:** Product (or Design, if Option A's design sprint produces a fixed tag set).

### 4a. The Dallas neighbourhood list for profile setup

PRD Module 2.2 says the home neighbourhood is chosen "from a set list of Dallas areas" and
Module 3.3 filters by "neighbourhood", but the PRD never enumerates the list. The Phase 1
schema therefore stores the neighbourhood as a validated free-text string
(`users.neighborhood`), and the profile screen accepts any value — the canonical list, once
provided, becomes a shared constant (e.g. in `packages/validation`) and a validation enum with
no schema change needed. The list also feeds the Module 3 neighbourhood filter.

**Implemented (cafe discovery):** `cafes.neighborhood` (`packages/database/src/schema/cafes.ts`)
is the same free-text `text` column, for the same reason. The mobile neighbourhood filter
(`GET /api/v1/cafes/neighborhoods`) lists the distinct values actually present in the data rather
than a guessed static list, so it stays correct with no code change once a canonical list exists.

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

**Phase 4 addition:** the same placeholder pattern now also applies to the Apple Pay merchant
identifier (`merchant.com.socialcup.app` in `app.json`'s `@stripe/stripe-react-native` plugin
config and `apps/mobile/src/app/_layout.tsx`'s `StripeProvider`) — a real Apple Merchant ID must
be registered in the Apple Developer portal and linked to the Stripe account before Apple Pay
will actually work in PaymentSheet; until then Apple Pay silently doesn't appear as an option
(card and Google Pay are unaffected).

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

### 8. Drink and cafe rating details not specified by the PRD

Module 5 says a member "rates a drink 1–5 stars, with an optional note up to 140 characters, or
skips it... editable at any time" and that "a cafe's star rating is the average of its drinks'
ratings." Two implementation details aren't settled by that wording:

- **Cafe aggregate calculation.** "The average of its drinks' ratings" reads two ways: the
  average of every individual rating across the cafe's drinks (weighted by how many times each
  drink was rated), or the unweighted average of each drink's own average. **Implemented
  interim modeling:** the weighted reading (`apps/api/src/domain/ratingAggregates.ts`,
  `cafeRatingAggregatesFor`) — the more standard aggregate-rating semantics, and it avoids a
  single 5-star rating on a rarely-ordered drink counting the same as a 50-rating drink's
  average. This does not resolve the underlying wording ambiguity.
- **Rating deletion.** The PRD states ratings are editable but never mentions deleting one.
  **Implemented interim modeling:** no delete endpoint exists — `PUT /api/v1/drinks/:drinkId/rating`
  creates or edits the caller's one rating for that drink; there is no `DELETE`. If a product
  owner wants deletion (e.g., "I want to retract a rating entirely, not just change it"), that's
  a new, additive endpoint, not a reinterpretation of existing behavior.

**Owner:** Product. Neither answer blocks the rest of Module 5 (both are conservative,
non-destructive interim readings, and both are trivially added to or changed in Phase 2+ without
a schema change).

### 9. Cafe payout rate and barista PIN have no admin UI to set them yet

Phase 5 (Module 8, redemption) needs every redemption-eligible cafe to already have a payout rate
(PRD Module 7.5, "$/credit, set by the administrator") and a barista PIN
(`cafe_barista_credentials.pinHash`/`payoutRateCents`) — but Module 9's admin cafe-management UI
that would let an administrator actually set either one is Phase 6, not yet built.

**Implemented interim modeling:** `payoutRateCents` is nullable, with **no invented default
value** — a cafe with it unset simply cannot have a redemption created against it
(`redemptionService.create` throws "This cafe is not yet set up for redemption"), which maps
cleanly onto the PRD's own "cafe is eligible for redemption" eligibility check rather than
guessing a dollar figure with no PRD basis. `packages/database/src/seed.ts` seeds every
development cafe with a PIN (`1234`) and a payout rate (70¢/credit, an arbitrary illustrative
value) purely so the Phase 5 flow is testable end to end locally — **not** a real business rate.

**Owner:** Product/Business (real per-cafe payout rates) and Engineering (Module 9's admin UI to
set them, Phase 6).

### 10. Barista trusted-device duration

PRD Module 8 says a barista device "stays trusted" after a correct PIN entry but never states for
how long. `BARISTA_TRUSTED_DEVICE_TTL_MS` (`apps/api/src/lib/tokens.ts`) is set to 90 days as an
interim engineering default — deliberately not permanent (per the root CLAUDE.md instruction not
to silently invent a forever-trust period), but also not a value the PRD specifies. An admin PIN
reset (Phase 6) invalidates all trusted devices for a cafe immediately regardless of this TTL, via
`pinVersion`/`pinVersionAtIssue` (see [docs/architecture/redemption.md](../architecture/redemption.md)).

**Owner:** Product (whether 90 days is the right operational tradeoff for how often cafe devices
actually change/get reset) or Engineering lead (if treated as a pure implementation default).

## PDF extraction issues (not ambiguities — noted for traceability)

The commercial sections (Section 6 engagement options, Section 7 project timeline/hours tables,
Section 8 team composition) suffered column-merge artifacts when the PDF was converted to text —
numbers and phrases from adjacent table columns interleaved. None of that content affects Phase 1
scope or any decision in this codebase, so it was not transcribed into
[docs/product/prd.md](../product/prd.md); refer to `SOCIAL_CUP_Proposal_Final 6.pdf` pages 12–15
directly if commercial detail is ever needed. Module 4.2's text had a similar artifact; see the
note inline in `docs/product/prd.md` Module 4.
