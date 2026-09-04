# @social-cup/database

Drizzle ORM schema, migrations, and the shared Postgres client for Social Cup.

## Status

This package is scaffolding only. No product tables exist yet — see
[docs/architecture/database-architecture.md](../../docs/architecture/database-architecture.md)
for why, and [docs/development/phases.md](../../docs/development/phases.md) for when schema
work begins.

## Layout

```
src/
  client.ts     Creates the Drizzle + postgres.js client (createDatabase())
  env.ts        Validates DATABASE_URL / DATABASE_SSL with Zod
  migrate.ts     Migration runner (pnpm db:migrate)
  schema/
    index.ts    Barrel file — add one file per domain area, export it here
migrations/     Generated SQL migrations (drizzle-kit output) — commit these
drizzle.config.ts
```

## Migration workflow

1. Add or edit a Drizzle table definition under `src/schema/`.
2. Export it from `src/schema/index.ts`.
3. Generate a migration: `pnpm db:generate` (runs `drizzle-kit generate`, diffing the schema
   against the migrations already in `migrations/`).
4. Review the generated SQL in `migrations/` — drizzle-kit does not always guess destructive
   changes (renames, type narrowing) correctly. Edit the SQL if needed.
5. Apply it locally: `pnpm db:migrate`.
6. Commit both the schema change and the generated migration file together.

`pnpm db:studio` opens Drizzle Studio against the configured `DATABASE_URL` for browsing data.

Migrations are applied the same way (`db:migrate`) in every environment — there is no
separate "push" workflow for staging/production. `drizzle-kit push` exists only for rapid
local prototyping before a migration has been generated; never run it against staging or
production.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed. See the root
[docs/architecture/database-architecture.md](../../docs/architecture/database-architecture.md)
for `DATABASE_SSL` behavior in RDS environments.
