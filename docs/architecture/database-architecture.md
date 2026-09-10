# Database Architecture

## Status

`packages/database` owns the schema and migrations for the product tables built so far.
**Implemented (Phase 1, Module 2):** the account domain — `users` plus the three token tables
(`email_verification_tokens`, `password_reset_tokens`, `refresh_tokens`) — see migration
`0000_next_hobgoblin.sql` and `packages/database/src/schema/{users,authTokens}.ts`.
**Implemented (Phase 1, Modules 3/4/9-discovery-slice):** `cafes` and `drinks` — see migration
`0001_nosy_red_ghost.sql` and `packages/database/src/schema/cafes.ts`. `neighborhood` (on both
`users` and `cafes`) and `vibeTags` are free text / a `jsonb` string array rather than a fixed
taxonomy — the PRD never enumerates a canonical Dallas-neighbourhood list or a vibe-tag
vocabulary (see [open-questions.md #4](../decisions/open-questions.md#4-cafe-vibe-tags--free-text-or-a-fixed-taxonomy)
and [#4a](../decisions/open-questions.md#4a-the-dallas-neighbourhood-list-for-profile-setup)) — both
are promotable to an enum later with no schema change once product supplies the list. `cafes`
carries no payout-rate column (Module 7/9's financial schema, gated separately — see below).
**Implemented (Phase 1, Module 5):** `ratings` — see migration `0002_mature_kang.sql` and
`packages/database/src/schema/ratings.ts`. A rating IS the drink diary's entry (the PRD's diary
is "every drink a member has rated" with exactly the fields a rating already carries), so there
is no separate `diary_entries` table. Development seed data lives in `packages/database/src/seed.ts`
(`pnpm db:seed`), clearly marked as non-production content — it does not seed ratings, since PRD
Module 5 content is real user activity, not fixture data.
**Implemented (Phase 4, Module 7):** `memberships`, `credit_ledger_entries`, and
`stripe_webhook_events` — see migration `0003_outgoing_salo.sql` and
`packages/database/src/schema/memberships.ts`. `memberships` is one row per user, created the
first time they start a subscription (a Visitor who never subscribes has no row); `status` is
normalized down to `incomplete`/`active`/`past_due`/`canceled` rather than storing Stripe's raw,
richer status enum (see [ADR-0011](../adr/0011-stripe-webhook-events-and-idempotency.md)).
`credit_ledger_entries` is the append-only ledger ADR-0003 called for — Phase 4 only ever inserts
`monthly_grant` rows, each carrying the granting Stripe invoice id (unique, the grant's
idempotency key) and the billing period it belongs to, so "current balance" is derived as the sum
of entries for the membership's current period rather than an all-time sum (no rollover, no
separate reset entry needed — see ADR-0011). `stripe_webhook_events` (`stripeEventId` primary key)
is the webhook idempotency claim, inserted in the same transaction as every state change the event
causes — a failed transaction rolls back the claim too, so a retried delivery reprocesses cleanly.
**Implemented (Phase 5, Module 8):** `redemption_codes`, `redemptions`, `cafe_barista_credentials`,
and `barista_trusted_devices` — see migration `0004_square_big_bertha.sql` and
`packages/database/src/schema/{redemptions,barista}.ts`. `redemption_codes` is the ephemeral
single-use-code lifecycle (`pending` → `redeemed`, or `pending` → `canceled` when a newer code
supersedes it); `redemptions` is the durable, audited record of a _completed_ redemption only,
carrying the cafe's payout rate as it was at the moment of the scan (not a live join) — exactly
the rule this document states below. `credit_ledger_entries.reason`'s check constraint was widened
to add `'redemption'` (still `'monthly_grant'` | `'redemption'`, no schema change to the balance
query itself — see ADR-0011). `cafe_barista_credentials` (PIN hash, `pinVersion`, payout rate) is
deliberately a separate table from `cafes`, not columns on it, so the public cafe-discovery API
can never leak them. Payouts (Module 9's admin payout runs) are not yet built.

The account schema, one file per domain area:

| Table                       | Purpose                                                                        | Key constraints / notes                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | The Social Cup account (PRD Module 2)                                          | `email` unique (normalized lowercase — see [docs/architecture/authentication.md](authentication.md)); `password_hash` bcrypt; `display_name` not null; `coffee_preferences` jsonb of the four PRD enum values (validated by Zod, not a Postgres enum — see the file comment); `email_verified_at` nullable; timestamps with timezone.                                                                      |
| `email_verification_tokens` | Single-use verification links                                                  | `token_hash` unique; `used_at`/`expires_at`; FK to `users` on delete cascade.                                                                                                                                                                                                                                                                                                                              |
| `password_reset_tokens`     | Single-use reset links (1h expiry)                                             | Same shape as verification tokens.                                                                                                                                                                                                                                                                                                                                                                         |
| `refresh_tokens`            | Rotated, revocable refresh sessions (ADR-0004)                                 | `token_hash` unique; `chain_id` groups one login's token lineage so reuse revocation can kill the whole chain; `rotated_at`/`revoked_at`; FK to `users` on delete cascade.                                                                                                                                                                                                                                 |
| `ratings`                   | Drink ratings and the drink diary (PRD Module 5)                               | `(user_id, drink_id)` unique index — one rating per member per drink, consumed via an atomic `ON CONFLICT DO UPDATE` upsert; `stars` check `between 1 and 5`; `note` check `char_length <= 140`; FKs to `users` and `drinks` on delete cascade. No `cafe_id` column — reached via `drink_id -> drinks.cafe_id` to avoid duplicating data already on `drinks`.                                              |
| `cafe_barista_credentials`  | Per-cafe barista PIN + payout rate (PRD Module 7.5, 8)                         | `cafe_id` unique (one row per cafe); `pin_hash` bcrypt (same helper as passwords); `pin_version` (bumping it invalidates every trusted device at once); `payout_rate_cents` nullable — a cafe with none set cannot have a redemption created against it. Separate table from `cafes` so the public discovery API can never `select()` a PIN hash.                                                          |
| `barista_trusted_devices`   | A device's "stays trusted" session after a correct PIN (PRD Module 8)          | `device_token_hash` unique (SHA-256, same pattern as `refresh_tokens`); `pin_version_at_issue` compared against the cafe's current `pin_version` on every use; `expires_at`; FK to `cafes` on delete cascade. No user account — a separate auth model from `requireAuth()`.                                                                                                                                |
| `redemption_codes`          | A member's five-minute single-use code (PRD Module 8)                          | `code_hash`/`backup_code_hash` unique (SHA-256, raw values never stored); `credit_price` snapshotted from the drink at code-creation time; `status` check `in ('pending','redeemed','canceled')` — no stored `'expired'` value, see docs/architecture/redemption.md; FKs to `users`, `cafes`, `drinks` on delete cascade.                                                                                  |
| `redemptions`               | The durable, audited record of a _completed_ redemption (PRD Module 7.5, 8, 9) | `redemption_code_id` and `credit_ledger_entry_id` both unique (exactly one redemption per code, per ledger deduction); `payout_rate_cents` and `credit_amount` snapshotted at scan time, never a live reference; `barista_trusted_device_id` FK (audit trail for which device redeemed it); no update/delete path — a future void (Phase 6) is a new reversing ledger entry, never a mutation of this row. |

Only a SHA-256 hash of any token is ever stored — the raw token exists only in the email
link/API response for its one use. No OAuth-identity columns exist: Google/Apple sign-in are UI
placeholders only in Phase 1, and a real identity table ships alongside actual token
verification, not speculatively ahead of it. Memberships (Visitor → Member) will be a separate
schema area in Phase 4 — `users` carries no subscription/credit columns, keeping
authentication decoupled from Stripe state by construction.

## Engine and tooling

- **PostgreSQL** on AWS RDS (single-engine, no read replicas or Aurora in this phase — see
  [docs/architecture/infrastructure.md](infrastructure.md)).
- **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`) — SQL-first, migrations are generated from
  TypeScript table definitions and reviewed as plain SQL before being applied. No implicit
  schema sync (`drizzle-kit push`) outside local prototyping — see
  `packages/database/README.md` for the exact workflow.
- **postgres.js** (`postgres` package) as the driver, wrapped by `createDatabase()` in
  `packages/database/src/client.ts`.

## Ownership

Only `apps/api` opens a connection to the database at runtime. No other app (mobile, admin,
barista) or package talks to PostgreSQL directly — they only ever go through the API. This is
what makes the financial rules in the root [CLAUDE.md](../../CLAUDE.md) enforceable: if a client
could read or write the database directly, "server-authoritative credit balance" would not mean
anything.

## Schema organization (for when it's built)

One file per domain area under `packages/database/src/schema/` (e.g. `users.ts`, `cafes.ts`,
`memberships.ts`, `credits.ts`, `redemptions.ts`), re-exported from `schema/index.ts`. Expected
domain areas, from the PRD modules:

| Schema area                 | PRD module      | Notes                                                                                                                                                                                                       |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users / accounts            | Module 2        | **Implemented** — see the account schema table above. Memberships and OAuth identities are separate, not-yet-built schema areas, not columns on `users`.                                                    |
| Cafes / drinks              | Modules 3, 4, 9 | **Implemented** — see above. Cafe, drink, pricing, featured/signature flags. No payout-rate column (separate, later schema area).                                                                           |
| Ratings                     | Module 5        | **Implemented** — see above. One rating per (member, drink), editable, not deletable (see [open-questions.md #8](../decisions/open-questions.md#8-drink-and-cafe-rating-details-not-specified-by-the-prd)). |
| Memberships / credit ledger | Module 7        | **Implemented** — append-only ledger, not just a mutable balance column — see below                                                                                                                         |
| Redemptions                 | Module 8        | **Implemented** — see [docs/architecture/redemption.md](redemption.md) for the concurrency-critical write path                                                                                              |
| Payouts                     | Module 9        | Not yet built. Per-cafe payout runs, references `redemptions` by the `payout_rate_cents` already stored on each row at redemption time                                                                      |

## Non-negotiable rules for the credit ledger and redemption schema

These follow directly from the PRD (Module 7.3, 7.5, 8.3) and the financial rules in the root
[CLAUDE.md](../../CLAUDE.md) — restated here because they constrain the schema, not just the
application code:

1. **The credit balance is derived, not just stored.** Model credits as an append-only ledger
   (grant/deduct/reset entries), not a single mutable integer column that different code paths
   increment and decrement. A mutable balance makes "was this deducted exactly once" unauditable
   after the fact; a ledger makes it a query.
2. **Every redemption stores the payout rate at the moment it happened** (PRD 7.5), never a
   foreign key alone to the cafe's _current_ rate — renegotiating a cafe's rate must never change
   a past month's statement.
3. **Redemption code consumption must be safe under concurrent scans of the same code.** This is
   a locking/transaction concern, not just a schema concern — see
   [docs/architecture/redemption.md](redemption.md) for the specific pattern (`SELECT ... FOR
UPDATE` plus a state check inside one transaction, or an equivalent atomic
   compare-and-swap). The schema must have a single row (or unique constraint) that such a
   transaction can lock — e.g. a `redemption_codes` table with a unique code and a status column
   that transitions exactly once.
4. **Voids restore credits and are themselves audited** (PRD 9.7: "every void is recorded with
   who performed it and the reason given") — a void is a new ledger entry that reverses the
   original, not a delete/update of the original redemption row.

## Migrations

Every schema change ships as a generated, reviewed SQL migration committed alongside the schema
change (see `packages/database/README.md`). Migrations run the same way
(`pnpm db:migrate`) in every environment — there is no environment-specific migration path.
`drizzle-kit push` (schema-sync without a migration file) is for local prototyping only and must
never run against staging or production.

## Connection configuration

`DATABASE_URL` and `DATABASE_SSL` are validated with Zod at startup (`packages/database/src/env.ts`,
re-validated by `apps/api/src/env.ts` so a misconfigured API fails before it ever tries to
connect). `DATABASE_SSL=true` is required for RDS in staging/production; local Docker Postgres
runs without TLS (`DATABASE_SSL=false`). Credentials are never embedded in the connection string
in a committed file — see [docs/architecture/infrastructure.md](infrastructure.md) for how RDS
credentials are generated and delivered via Secrets Manager.
