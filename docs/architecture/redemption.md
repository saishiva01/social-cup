# Redemption Architecture

## Status

**Implemented (Phase 5, PRD Module 8).** Schema (`redemption_codes`, `redemptions`,
`cafe_barista_credentials`, `barista_trusted_devices` — migration `0004_square_big_bertha.sql`,
`packages/database/src/schema/{redemptions,barista}.ts`), the member-facing creation/polling API
(`apps/api/src/services/redemptionService.ts`, `routes/v1/redemptions.ts`), the barista PIN/scan
API (`apps/api/src/services/baristaService.ts`, `routes/v1/barista.ts`), the mobile redemption
flow (`apps/mobile/src/app/redeem/[drinkId].tsx`), and the barista web app (`apps/barista/src/`)
all exist. The atomic conditional-UPDATE pattern this document specifies (below) is implemented
exactly as written in `baristaService.redeem` — see that function's comments for how each
paragraph below maps to code. Camera/QR scanning is **not** implemented — see "What's explicitly
deferred". This document defines the concurrency design implementation follows — it is the single
most safety-critical piece of Social Cup, called out explicitly in the root
[CLAUDE.md](../../CLAUDE.md):

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
(PRD Module 1.2: _"a second scheduled job clears redemption codes that were generated but never
scanned"_) is garbage collection for the codes table, not a correctness dependency. See
[docs/architecture/infrastructure.md](infrastructure.md) for how that scheduled job is wired
(EventBridge Scheduler → ECS task).

## Testing requirement

Per PRD Module 10.1, the QA plan for this flow explicitly must include "two devices scanning one
code at the same moment" — i.e. an integration test that fires concurrent requests at the
redemption endpoint for the same code and asserts exactly one success. See
[docs/development/testing-strategy.md](../development/testing-strategy.md).

## Barista authentication and trusted devices (as implemented)

Barista access has no user account and does not use the access/refresh token scheme in
[docs/architecture/authentication.md](authentication.md) at all. Instead:

- `cafe_barista_credentials` (one row per cafe, added to the barista flow) stores `pinHash`
  (bcrypt, same helper as member passwords, `apps/api/src/lib/password.ts`) and `payoutRateCents`
  — deliberately a **separate table from `cafes`**, not columns on it, so the public
  cafe-discovery API can never leak a PIN hash or payout rate through a `select()`.
- `POST /barista/authenticate` takes `{ cafeId, pin }` (the cafe id is not secret — see PRD Module
  8: "the link is not a secret, the PIN is the credential") and, on a correct PIN, issues an
  opaque, SHA-256-hashed device token (`barista_trusted_devices`, same pattern as `refresh_tokens`
  — ADR-0004) in an httpOnly, `SameSite=Strict` cookie scoped to `/api/v1/barista`
  (`apps/api/src/lib/baristaCookie.ts`). The raw PIN and the raw device token are never logged and
  the device token is never readable from JavaScript.
- Every subsequent barista request derives its cafe **only** from that cookie
  (`requireBaristaAuth` middleware → `baristaService.validateDeviceToken`), never from anything the
  browser sends in a body/query — this is what makes "a barista cannot choose another cafe" a
  server-enforced property, not a UI convention.
- `pinVersion` on `cafe_barista_credentials` plus `pinVersionAtIssue` on each trusted-device row is
  how a future admin PIN reset (Phase 6) invalidates every trusted device for a cafe at once
  without deleting rows: bump `pinVersion`, and `validateDeviceToken` rejects any device whose
  `pinVersionAtIssue` no longer matches.
- Trusted-device duration (`BARISTA_TRUSTED_DEVICE_TTL_MS`, `apps/api/src/lib/tokens.ts`) is an
  interim 90-day engineering default — the PRD says a device "stays trusted" but never states for
  how long. See [docs/decisions/open-questions.md](../decisions/open-questions.md).

## What's explicitly deferred

- **Camera/QR scanning.** The PRD's described UX has the barista's camera reading a QR code; this
  phase implements manual entry of the primary code or the six-digit backup code only (see
  `apps/barista/src/components/ScanScreen.tsx`) — both go through the identical
  `POST /barista/redeem` validation, so a scanner can be added later feeding the same text input
  without any change to the validation/transaction logic. Not a correctness gap, a UI scope cut.
- Offline scanning when a cafe loses connectivity (Out of Scope, Phase 2 — PRD is explicit that a
  dropped connection must fail safely, not queue for later).
- Any caching of code validity at the edge/CDN — every validation is a direct, uncached hit to
  the API and database, deliberately, because staleness here is a financial correctness bug, not
  a UX inconvenience.
- The expired-code cleanup scheduled job (PRD Module 1.2) — the Terraform `scheduler` module
  already anticipates it (`infrastructure/modules/scheduler/`), but wiring an actual job is
  deferred AWS infrastructure work, consistent with how the Phase 4 monthly-reset job was never
  wired either (superseded by the derived-balance query design, ADR-0011). This is pure table
  hygiene, not a correctness dependency — see "Expiry and cleanup" above.
- Admin PIN reset and cafe payout-rate management UI (Phase 6, Module 9) — the schema
  (`pinVersion`, `payoutRateCents`) already supports both with no future migration.
