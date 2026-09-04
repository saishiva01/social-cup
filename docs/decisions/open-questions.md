# Open Questions

Ambiguities and unresolved decisions found in the PRD (`SOCIAL_CUP_Proposal_Final 6.pdf`) or
introduced by this engineering-foundation work. **None of these have been silently resolved in
code or docs** — each needs a product-owner (or, where marked, an engineering-lead) decision
before the feature area it touches is built. Update this file — don't just fix the code — when
one is answered.

## Product / PRD ambiguities

### 1. Can a Visitor browse, search, and rate without ever subscribing?

**Status:** Explicitly flagged by the PRD itself, not by this codebase.

The PRD states in Module 2.5 (Account States): *"This document assumes that registered users can
browse, search, and rate without subscribing, and that payment is required only in order to
redeem a drink. Please confirm before Module 7 is built."*

This assumption is used consistently throughout the rest of the document (Visitor role in
Section 2, Module 3–6 all describe Visitor access to browse/search/rate). Nothing in this
engineering-foundation phase depends on the answer, but it must be confirmed before Module 7
(Membership and Credits) and the auth/authorization model are implemented, since it determines
whether "authenticated" and "entitled to redeem" are the same check or two separate ones.

**Owner:** Product.

### 2. Is the $1-per-credit rate a fixed platform constant or an admin-editable setting?

Module 7.1 states flatly: *"One credit is worth one dollar at any partner cafe"* — read in
context as a fixed rule. Module 9.2 (Admin Panel → Settings) lists *"The credit value in dollars,
currently one credit equals one dollar"* as a value shown in the Settings screen, which reads as
admin-editable.

If it's editable, every historical redemption needs its own snapshot of the credit-to-dollar rate
at the time it happened (the same pattern the PRD already specifies for the per-cafe payout rate
in Module 7.5), and a rate change needs an audit trail. If it's a fixed constant, none of that is
needed and the value can live in application config instead of the database.

**Owner:** Product. **Affects:** `packages/database` schema design when Module 7 is built —
resolve before then, not after.

### 3. Apple in-app-purchase rejection fallback

Module 7.6 sells the membership through Stripe's in-app payment sheet (not Apple IAP), citing
Apple guideline 3.1.5(a) (physical goods consumed outside the app). The PRD includes its own
contingency note: *if Apple's review team rejects this despite the guideline, the fallback is a
Stripe Checkout page on the Social Cup website, opened from the app — and that fallback is
explicitly "not included in this proposal,"* scoped separately at ~10–12 hours.

This is a real risk, not a hypothetical: Apple review outcomes on 3.1.5(a) interpretation are not
fully predictable in advance. This foundation does not build toward either outcome specifically,
but see [docs/architecture/payments.md](../architecture/payments.md) for the one place a design
choice was made with this risk in mind (keeping subscription-creation logic behind a
Stripe-webhook-driven state machine rather than a client-confirms-and-tells-the-server flow,
so a second checkout entry point could reuse the same backend logic if the fallback is ever
commissioned).

**Owner:** Product/Business (decide whether to pre-emptively scope the fallback) and Engineering
(re-confirm the webhook-driven design still covers it, when/if commissioned).

### 4. Cafe "vibe tags" — free text or a fixed taxonomy?

Module 3.2 shows cafe cards with "vibe tags, for example good for remote work" and Module 9.3
lets the administrator set them when adding a cafe. The PRD doesn't say whether these are
free-text, a curated fixed list, or an admin-managed open taxonomy. Doesn't block this phase;
affects the cafes/drinks schema when Module 9 is built.

**Owner:** Product (or Design, if Option A's design sprint produces a fixed tag set).

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
