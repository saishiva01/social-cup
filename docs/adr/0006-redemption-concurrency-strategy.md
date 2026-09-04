# ADR-0006: Redemption code consumption via a single atomic conditional update

## Status

Accepted (design decision for Module 8 — not yet implemented; see
[docs/development/phases.md](../development/phases.md)).

## Context

See [docs/architecture/redemption.md](../architecture/redemption.md) for the full concurrency
problem statement. In short: two simultaneous scans of the same redemption code must resolve to
exactly one success, and the PRD states this must happen inside "one locked database transaction"
(Module 8.3).

## Decision

Consume a redemption code with a single, atomic, conditional SQL statement —

```sql
UPDATE redemption_codes
   SET status = 'redeemed', redeemed_at = now()
 WHERE code = $1 AND status = 'active' AND expires_at > now()
RETURNING id, member_id, cafe_id, drink_id;
```

— executed inside the same database transaction as the credit-ledger deduction insert and the
redemption record insert. Zero rows returned means the code was already consumed, expired, or
never existed, and the request resolves to the appropriate red result without needing a separate
explicit row lock. This was chosen over pessimistic locking (`SELECT ... FOR UPDATE` followed by
a separate `UPDATE`) because it needs no explicit lock-then-check-then-write sequence for a
developer to get subtly wrong later — Postgres's MVCC guarantees only one concurrent `UPDATE`
can match `status = 'active'` and win.

## Consequences

- Every redemption-code validation query must include `AND status = 'active' AND expires_at >
  now()` in the same statement that performs the transition — a separate `SELECT` to check
  status "first" followed by an `UPDATE` is exactly the race this ADR exists to prevent, and must
  not be reintroduced during implementation for convenience (e.g. to produce a nicer error
  message before attempting the update).
- The specific red-result reason (expired vs. already-used vs. wrong-cafe vs. membership-inactive
  vs. insufficient-credits) requires a follow-up read after a failed conditional update returns
  zero rows, purely to report *why* to the barista — that follow-up read must not be used to
  decide whether to proceed with the deduction, only to explain a decision already made.
- This pattern is the one required, tested behavior — see
  [docs/development/testing-strategy.md](../development/testing-strategy.md) for the concurrent-scan
  test that verifies it holds.
