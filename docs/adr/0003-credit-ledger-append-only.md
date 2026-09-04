# ADR-0003: Credit balance as an append-only ledger, not a mutable counter

## Status

Accepted (design decision for Module 7/8 schema work — not yet implemented; see
[docs/development/phases.md](../development/phases.md)).

## Context

A member's credit balance is affected by at least four distinct events: a subscription payment
grants 30 credits, a monthly renewal resets the balance to 30, a successful redemption deducts
one or more credits, and an admin void restores credits (PRD Modules 7.3, 9.7). The financial
rules in the root [CLAUDE.md](../../CLAUDE.md) require the balance to be server-authoritative and
require that a redemption code can never be consumed twice — both are audit and correctness
requirements, not just current-state requirements.

## Decision

Model credits as an append-only ledger table (e.g. `credit_ledger_entries`: member id, delta,
reason enum [`grant`, `renewal_reset`, `redemption`, `void`], reference to the causing
redemption/subscription-event row, created-at) rather than a single mutable `credits_remaining`
integer column on the member/membership row that different code paths increment and decrement in
place.

The current balance is a query (`SUM(delta)` for the current billing cycle, or a maintained
denormalized column recomputed/verified from the ledger) rather than the sole source of truth.

## Consequences

- **Auditability by construction.** "Why does this member have 12 credits" is answerable by
  reading their ledger, not by trusting that every code path that ever touched a mutable column
  did so correctly. This is the same reasoning the PRD itself applies to redemption voids
  ("every void is recorded with who performed it and the reason given," PRD 9.7) — extended to
  every credit-affecting event, not just voids.
- **Double-deduction becomes a constraint violation, not a logic bug to avoid.** Combined with
  the redemption-code consumption pattern in
  [docs/architecture/redemption.md](../architecture/redemption.md) (an atomic, transactional code
  consumption that can only succeed once), the corresponding ledger entry is inserted in the same
  transaction — so a double-scan either produces one ledger entry or none, never two.
- **A small performance/complexity cost:** reading "current balance" means a query over the
  ledger (or maintaining and periodically reconciling a denormalized balance column) rather than
  reading one column directly. Given Social Cup's scale (a Dallas-only network, not
  millions of transactions/day) this cost is not a concern worth trading away the audit
  guarantees for.
- Monthly resets are themselves ledger entries (`renewal_reset`, delta calculated to bring the
  cycle's balance back to 30), not a `credits_remaining = 30` overwrite — so a member's history
  shows the reset happened, not just its result.
