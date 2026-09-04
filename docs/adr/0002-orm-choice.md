# ADR-0002: Drizzle ORM over Prisma

## Status

Accepted.

## Context

The stack was specified as PostgreSQL with Drizzle ORM (given, not chosen here). This ADR
records *why* that fits, for anyone who later questions it against the more common default
choice (Prisma) — Drizzle is the less-adopted option of the two, so the reasoning is worth
stating explicitly rather than assumed.

## Decision

Use Drizzle ORM + `drizzle-kit` for schema definition and migrations.

Reasons this fits Social Cup specifically:

1. **The redemption transaction is the single highest-stakes piece of code in this system** (see
   [docs/architecture/redemption.md](../architecture/redemption.md)) and needs a `SELECT ... FOR
   UPDATE` or an atomic conditional `UPDATE ... RETURNING` inside a hand-controlled transaction.
   Drizzle's query builder produces close-to-SQL, inspectable queries and its transaction API
   (`db.transaction(async (tx) => { ... })`) doesn't hide what's actually being sent to Postgres.
   That matters more here than an ORM's convenience features.
2. **Migrations are generated SQL, reviewed as SQL, committed as SQL** — `drizzle-kit generate`
   diffs the TypeScript schema against existing migrations and writes a plain `.sql` file; there
   is no separate proprietary migration DSL to learn or audit, and no migration engine binary
   bundled into the runtime.
3. **No code-generation step blocks `apps/api` from starting.** Prisma requires `prisma generate`
   to produce its client before types are available; Drizzle's types come directly from the
   TypeScript schema definitions, so there's one less required build step in the loop.
4. Lighter runtime footprint (no Rust query-engine binary), which matters modestly for ECS
   Fargate cold-start/image size, though this was not the deciding factor.

## Consequences

- Schema files under `packages/database/src/schema/` are hand-written Drizzle table definitions,
  not introspected from an existing database — the database is schema-first from Drizzle's
  perspective, matching "database is the source of truth for structure, migrations are the audit
  trail" rather than the reverse.
- Anyone used to Prisma's relation/include-based query API will need to write closer-to-SQL joins
  with Drizzle's query builder — a real onboarding cost, accepted deliberately for the visibility
  it gives into exactly what's executed against the credit ledger and redemption tables.
- `drizzle-kit push` (schema push without a migration file) exists and is convenient for local
  prototyping, but per [packages/database/README.md](../../packages/database/README.md) must
  never be used against staging/production — only generated, reviewed migrations are applied
  there.
