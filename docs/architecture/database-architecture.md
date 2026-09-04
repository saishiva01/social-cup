# Database Architecture

## Status

`packages/database` is scaffolding: a validated connection (`createDatabase()`), a migration
runner, and an empty schema barrel file. **No product tables exist yet, on purpose** — see
[docs/development/phases.md](../development/phases.md) for when schema work for cafes, members,
credits, and redemptions begins. This document describes the rules that schema work must follow
when it starts, not a schema that already exists.

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

| Schema area | PRD module | Notes |
|---|---|---|
| Users / accounts | Module 2 | Visitor vs. Member state, OAuth identities (Google/Apple), profile |
| Cafes / drinks | Modules 3, 4, 9 | Cafe, drink, pricing, featured/signature flags |
| Ratings | Module 5 | One rating per (member, drink) |
| Memberships / credit ledger | Module 7 | Append-only ledger, not just a mutable balance column — see below |
| Redemptions | Module 8 | See [docs/architecture/redemption.md](redemption.md) for the concurrency-critical write path |
| Payouts | Module 9 | Per-cafe payout runs, references redemptions by the rate stored at redemption time |

## Non-negotiable rules for the credit ledger and redemption schema

These follow directly from the PRD (Module 7.3, 7.5, 8.3) and the financial rules in the root
[CLAUDE.md](../../CLAUDE.md) — restated here because they constrain the schema, not just the
application code:

1. **The credit balance is derived, not just stored.** Model credits as an append-only ledger
   (grant/deduct/reset entries), not a single mutable integer column that different code paths
   increment and decrement. A mutable balance makes "was this deducted exactly once" unauditable
   after the fact; a ledger makes it a query.
2. **Every redemption stores the payout rate at the moment it happened** (PRD 7.5), never a
   foreign key alone to the cafe's *current* rate — renegotiating a cafe's rate must never change
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
