# ADR-0009: Credit value fixed at $1 per credit for Phase 1, not admin-configurable

## Status

Accepted. This is a **confirmed product decision**, not an engineering choice — it resolves
[open-questions.md #2](../decisions/open-questions.md#2-is-the-1-per-credit-rate-a-fixed-platform-constant-or-an-admin-editable-setting).
Not yet implemented (Phase 1, Module 7 — see [docs/development/phases.md](../development/phases.md)).
Does not modify or reinterpret [ADR-0008](0008-visitor-member-account-states.md), which remains
unchanged.

## Context

### The PRD's original requirement (as written, ambiguous between two modules)

Module 7.1 states flatly: _"One credit is worth one dollar at any partner cafe"_ — read in
context as a fixed rule. Module 9.2 (Admin Panel → Settings) separately lists _"the credit value
in dollars (currently one credit = one dollar)"_ among the Settings screen's fields — appearing
in a Settings screen reads as admin-editable, which would contradict Module 7.1's fixed framing.

The two readings matter for schema design: if the rate were editable, every historical redemption
would need its own snapshot of the credit-to-dollar rate at the time it happened (the same
pattern the PRD already specifies for the per-cafe _payout_ rate in Module 7.5 — a different,
already-unambiguous, admin-editable-per-cafe rate, not to be confused with this one), and a rate
change would need an audit trail. If fixed, none of that is needed and the value can live in
application config instead of the database.

## Decision

**Confirmed: 1 credit = exactly $1 of drink value. This value is fixed for Phase 1.**

### Final product decision

- 1 credit = exactly $1 of drink value.
- This value is **fixed**, not admin-configurable, in Phase 1.
- There are no credit-value overrides and no variable credit denominations.
- There are no credit top-ups; credits are not purchased separately from the membership.
- The membership provides the monthly credit allowance defined by the PRD (30 credits/month,
  no rollover — Module 7.1).
- Redemption consumes credits according to the PRD's existing credit model (Module 7.3, 8) —
  this decision does not change how or when credits are deducted, only confirms that the
  dollar-value of a credit is fixed.

### Phase 1 scope boundary

Module 9.2's "credit value in dollars" Settings field is **displayed, not editable**, in Phase 1.
It is not backed by an admin-editable setting, and no UI or API for changing it is built in
Phase 1. This does not remove the field from the Settings screen as a piece of PRD-specified UI —
it clarifies that in Phase 1 it renders a fixed constant rather than accepting input.

This decision does not resolve, and is not to be read as resolving, the separate, already-decided
per-cafe **payout** rate (Module 7.5), which remains admin-editable per cafe and is already
required to be snapshotted onto every redemption record — unaffected by this ADR.

## Consequences

- **No credit-value history/audit schema is needed.** Because the rate is fixed, not editable,
  there is no "rate at the time of redemption" to snapshot for the member-facing dollar value —
  unlike the per-cafe payout rate, which already requires exactly that (Module 7.5,
  [docs/architecture/database-architecture.md](../architecture/database-architecture.md)). The
  credit-ledger design in [ADR-0003](0003-credit-ledger-append-only.md) tracks credit _counts_
  (grants, resets, deductions, voids) and is unaffected either way; this ADR only settles the
  _dollar value_ of one credit.
- The value can live in application config (an environment variable or a constant), not a
  database-backed setting, when Module 7/9 schema work begins.
- **Consequences for future phases:** if a future phase (Phase 2 or later) ever wants to make the
  credit value admin-editable, that is a **new, explicit product decision** requiring its own ADR
  — it is not something a future session may infer from Module 9.2's Settings-screen UI alone.
  That future decision would also need to specify the historical-snapshot/audit-trail schema this
  ADR confirms is unnecessary today.
- This decision is about **product behavior** only. It does not itself authorize implementing any
  schema, credit logic, membership logic, or API — that remains Phase 1 work, gated by the phase
  boundaries in the root [CLAUDE.md](../../CLAUDE.md).
- No other open question is affected or resolved by this ADR. In particular, [open-questions.md
  #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback) and
  [#4](../decisions/open-questions.md#4-cafe-vibe-tags--free-text-or-a-fixed-taxonomy) remain
  open, and [ADR-0008](0008-visitor-member-account-states.md) (Visitor/Member account states) is
  unchanged by this decision.

## PRD reference

- Module 7.1 (The plan) — "one credit is worth one dollar," 30 credits/month, no rollover.
- Module 9.2 (Admin Panel → Settings) — the credit-value-in-dollars Settings field this ADR
  clarifies as fixed/read-only in Phase 1.
- Module 7.5 — the separate, already-unambiguous, per-cafe payout rate (not affected by this ADR).
- Module 7.3, Module 8 — the existing credit grant/deduction model, unchanged by this decision.
