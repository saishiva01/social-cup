# Redemption Architecture

## Status

No redemption code, endpoints, or schema exist yet (see
[docs/development/phases.md](../development/phases.md)). This document defines the concurrency
design that implementation must follow — it is the single most safety-critical piece of Social
Cup, called out explicitly in the root [CLAUDE.md](../../CLAUDE.md):

> Two simultaneous scans of the same code must never result in two successful redemptions.

## What the PRD specifies (Module 8)

1. Member confirms a drink at the counter → a single-use code appears, five-minute countdown
   starting at confirmation.
2. A member may hold only one live code at a time; generating a new one cancels the old one.
3. Barista scans the code (or types the six-digit backup) on the cafe's PIN-trusted scan page.
4. The server validates and responds green (with member name/photo, drink, credits deducted) or
   red (with exactly one reason: expired, already used, membership inactive, not enough credits,
   wrong cafe, or no connection) in about three seconds.
5. **"The deduction runs inside one locked database transaction, so a code can never be used
   twice."** (PRD 8.3, verbatim.)
6. Credits are deducted only on a successful scan — a member who walks away loses nothing.
7. The cafe's payout rate is written onto the redemption record at the moment of the scan.
8. If the connection drops mid-scan, the scan fails safely and no credits are deducted.

## The concurrency problem, precisely

Two baristas (or one barista double-tapping, or a retried request after a dropped connection)
submit the same code to the API at effectively the same instant. Exactly one must succeed
(green, credit deducted, code consumed) and the other must fail safely (red: "already used") —
never both succeeding (double redemption, a cafe paid twice for one drink and a member charged
twice) and never both failing (a member correctly charged loses their credit for nothing).

A naive implementation — `SELECT` the code, check its status in application code, then `UPDATE`
it to consumed — has a race: both requests can `SELECT` the code while it's still `active`,
both pass the check, both proceed to deduct a credit and mark it consumed. The check and the
consume are not atomic.

## Required pattern

Redemption code consumption must happen as a single, transactionally-safe read-modify-write. Two
equivalent approaches, either is acceptable — pick one and apply it consistently, don't mix them:

**A. Pessimistic locking (`SELECT ... FOR UPDATE`):**

```sql
BEGIN;
SELECT id, status, member_id, cafe_id, drink_id, expires_at
  FROM redemption_codes
  WHERE code = $1
  FOR UPDATE;                      -- blocks a concurrent transaction on the same row
-- application code checks status = 'active' AND expires_at > now() AND cafe matches
UPDATE redemption_codes SET status = 'redeemed', redeemed_at = now() WHERE id = $1;
INSERT INTO credit_ledger_entries (...) VALUES (...);   -- the deduction, same transaction
INSERT INTO redemptions (...) VALUES (...);             -- payout rate snapshot, same transaction
COMMIT;
```

The second concurrent transaction's `SELECT ... FOR UPDATE` blocks until the first commits, then
sees the now-`redeemed` status and fails cleanly — no double deduction, no lost update.

**B. Optimistic/atomic compare-and-swap (a single conditional `UPDATE`):**

```sql
UPDATE redemption_codes
   SET status = 'redeemed', redeemed_at = now()
 WHERE code = $1 AND status = 'active' AND expires_at > now()
RETURNING id, member_id, cafe_id, drink_id;
```

If this returns zero rows, the code was already consumed, expired, or never existed — the
caller treats that as a red result without needing a separate lock. If it returns one row, this
request "won" the race and proceeds to insert the ledger entry and redemption record inside the
same transaction. This is generally preferable to (A): no explicit lock management, and
Postgres's own MVCC guarantees exactly one concurrent `UPDATE` sees `status = 'active'`.

Either way, **the credit deduction and the code-consumption update happen in the same database
transaction** as each other — never as two separate statements/requests where one could succeed
without the other (that would either deduct credits without consuming the code, or consume the
code without deducting credits).

## Why "the server validates in ~3 seconds" doesn't relax this

The three-second target (PRD 8) is a UX latency budget for the barista-facing scan flow, not
license to weaken the transaction. The pattern above is a single round-trip to Postgres and
comfortably fits that budget; it is not a tradeoff between "fast" and "correct."

## Expiry and cleanup

A five-minute-expired code must be rejected by the validation query itself (`expires_at > now()`
in the `WHERE` clause above), not by relying on a background job having already run — the job
(PRD Module 1.2: *"a second scheduled job clears redemption codes that were generated but never
scanned"*) is garbage collection for the codes table, not a correctness dependency. See
[docs/architecture/infrastructure.md](infrastructure.md) for how that scheduled job is wired
(EventBridge Scheduler → ECS task).

## Testing requirement

Per PRD Module 10.1, the QA plan for this flow explicitly must include "two devices scanning one
code at the same moment" — i.e. an integration test that fires concurrent requests at the
redemption endpoint for the same code and asserts exactly one success. See
[docs/development/testing-strategy.md](../development/testing-strategy.md).

## What's explicitly deferred

- Offline scanning when a cafe loses connectivity (Out of Scope, Phase 2 — PRD is explicit that a
  dropped connection must fail safely, not queue for later).
- Any caching of code validity at the edge/CDN — every validation is a direct, uncached hit to
  the API and database, deliberately, because staleness here is a financial correctness bug, not
  a UX inconvenience.
