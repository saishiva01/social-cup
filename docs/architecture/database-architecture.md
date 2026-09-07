# Database Architecture

## Status

`packages/database` owns the schema and migrations for the product tables built so far.
**Implemented (Phase 1, Module 2):** the account domain — `users` plus the three token tables
(`email_verification_tokens`, `password_reset_tokens`, `refresh_tokens`) — see migration
`0000_next_hobgoblin.sql` and `packages/database/src/schema/{users,authTokens}.ts`. Everything
else (cafes, drinks, ratings, memberships, credits, redemptions, payouts) is not yet built and
will follow the rules below when it is.

The account schema, one file per domain area:

| Table                       | Purpose                                        | Key constraints / notes                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | The Social Cup account (PRD Module 2)          | `email` unique (normalized lowercase — see [docs/architecture/authentication.md](authentication.md)); `password_hash` bcrypt; `display_name` not null; `coffee_preferences` jsonb of the four PRD enum values (validated by Zod, not a Postgres enum — see the file comment); `email_verified_at` nullable; timestamps with timezone. |
| `email_verification_tokens` | Single-use verification links                  | `token_hash` unique; `used_at`/`expires_at`; FK to `users` on delete cascade.                                                                                                                                                                                                                                                         |
| `password_reset_tokens`     | Single-use reset links (1h expiry)             | Same shape as verification tokens.                                                                                                                                                                                                                                                                                                    |
| `refresh_tokens`            | Rotated, revocable refresh sessions (ADR-0004) | `token_hash` unique; `chain_id` groups one login's token lineage so reuse revocation can kill the whole chain; `rotated_at`/`revoked_at`; FK to `users` on delete cascade.                                                                                                                                                            |

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

| Schema area                 | PRD module      | Notes                                                                                                                                                    |
| --------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users / accounts            | Module 2        | **Implemented** — see the account schema table above. Memberships and OAuth identities are separate, not-yet-built schema areas, not columns on `users`. |
| Cafes / drinks              | Modules 3, 4, 9 | Cafe, drink, pricing, featured/signature flags                                                                                                           |
| Ratings                     | Module 5        | One rating per (member, drink)                                                                                                                           |
| Memberships / credit ledger | Module 7        | Append-only ledger, not just a mutable balance column — see below                                                                                        |
| Redemptions                 | Module 8        | See [docs/architecture/redemption.md](redemption.md) for the concurrency-critical write path                                                             |
| Payouts                     | Module 9        | Per-cafe payout runs, references redemptions by the rate stored at redemption time                                                                       |

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
