# ADR-0008: Visitor/Member account states — subscription gates only redemption

## Status

Accepted. This is a **confirmed product decision**, not an engineering choice — it resolves
[open-questions.md #1](../decisions/open-questions.md#1-can-a-visitor-browse-search-and-rate-without-ever-subscribing),
the ambiguity the PRD itself flagged and asked to have confirmed before Module 7 is built. Not
yet implemented (Phase 1, Module 2 — see [docs/development/phases.md](../development/phases.md)).

## Context

PRD Module 2.5 (Account States) states its own assumption and asks for it to be confirmed:
_"This document assumes that registered users can browse, search, and rate without subscribing,
and that payment is required only in order to redeem a drink. Please confirm before Module 7 is
built."_ Section 2 (Target Audience and Roles) and Modules 3–6 are all written consistently with
that assumption already — a registered-but-unsubscribed **Visitor** browses, searches, filters,
views cafe/drink detail, views ratings, rates drinks, and keeps a drink diary, identically to a
**Member**, in every module before Module 7 (Membership and Credits).

Without this confirmation, `apps/api`'s authorization model couldn't be finalized: it left open
whether "authenticated" and "entitled to redeem" were the same check (subscription required for
the whole app) or two separate checks (subscription required only at the point of redemption).
[docs/architecture/authentication.md](../architecture/authentication.md) was written to support
either answer, pending this decision.

## Decision

**Confirmed as the PRD assumes it: subscription/payment gates redemption and credits only. It
gates nothing else.**

### Visitor (registered, not subscribed)

A Visitor has created an account (PRD Module 2 — email/password, Google Sign-In, or Apple
Sign-In, with email verification) but has not subscribed. A Visitor can:

- Browse all partner cafes.
- Search cafes.
- Filter cafes (neighbourhood, etc.).
- View cafe details and menus.
- View drink ratings.
- Rate individual drinks.
- Maintain a drink diary.

A Visitor **cannot** redeem a drink and does not receive or use drink credits.

### Member (subscribed)

A Member is a Visitor who additionally:

- Receives 30 drink credits on each successful monthly subscription payment (PRD Module 7.1–7.2).
- Can redeem eligible drinks using those credits.

A Member retains every Visitor capability — subscribing adds redemption on top, it does not
replace or re-gate anything a Visitor could already do.

### Subscription boundary

Subscription/payment is required **only** for redemption and the credit functionality that
supports it. It must never gate: browsing, searching, filtering, viewing cafes, viewing menus,
viewing ratings, rating drinks, or the drink diary. Any authorization check that would block one
of those actions for an unsubscribed-but-authenticated user is a bug against this decision, not a
stricter reading of it.

### Redeem button behavior (PRD Module 4, "Actions")

The Redeem action on a cafe/drink page behaves according to account state, exactly as specified
in PRD Module 4.2:

| Account state                       | Redeem action                                    |
| ----------------------------------- | ------------------------------------------------ |
| Visitor                             | → membership screen                              |
| Member with credits                 | → drink picker                                   |
| Member with zero credits            | → disabled redemption state + renewal date shown |
| Member with failed/inactive payment | → disabled redemption state + card-update prompt |

## Consequences

- **"Authenticated" and "entitled to redeem" are two separate checks, not one.** Route-level auth
  middleware (does a valid access token exist) is distinct from the account-state check that
  gates only the redemption endpoints and the Redeem button's active state. Browsing/search/
  rating/diary endpoints require authentication (a registered account) but never an account-state
  check beyond that.
- [docs/architecture/authentication.md](../architecture/authentication.md)'s authorization model
  is confirmed as written: Visitor vs. Member is a state layered on top of "authenticated," not a
  replacement for it, and every state-gated action is re-checked server-side regardless of what
  the client renders (same server-authority principle as the root
  [CLAUDE.md](../../CLAUDE.md) financial rules).
- Module 2 (Onboarding and Authentication) can now be built without this ambiguity blocking it —
  see [docs/development/phases.md](../development/phases.md), whose Module 2 gate previously named
  this exact question.
- This decision is about **product behavior** only. It does not itself authorize building
  anything: no auth screens, no database schema, and no authorization middleware are implemented
  by this ADR. Those remain Phase 1 work, gated by the phase boundaries in the root
  [CLAUDE.md](../../CLAUDE.md).
- No other open question is affected or resolved by this ADR (in particular, [open-questions.md
  #2](../decisions/open-questions.md#2-is-the-1-per-credit-rate-a-fixed-platform-constant-or-an-admin-editable-setting)
  and [#3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback) remain open).

## PRD reference

- Module 2.5 (Account States) — the confirmation request this ADR answers.
- Section 2 (Target Audience and Roles) — Member and Visitor role definitions.
- Module 3–6 — Visitor-accessible discovery, detail, rating, and diary features.
- Module 4.2 (Actions) — Redeem button behavior per account state.
- Module 7 (Membership and Credits) — the subscription/credit mechanics this decision unblocks.
