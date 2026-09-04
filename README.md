# Social Cup

A Dallas coffee membership platform: members pay a monthly subscription for drink credits,
redeem them at partner cafes by showing a code at the counter, and rate the individual drinks
they try. See [docs/product/prd.md](docs/product/prd.md) for the full product spec and
[CLAUDE.md](CLAUDE.md) for how this repository is meant to be worked in (architecture, rules,
phase boundaries).

## Status

Engineering foundation only. No product feature is implemented yet — see
[docs/development/phases.md](docs/development/phases.md).

## Repository structure

```
apps/
  mobile/       React Native + Expo + Expo Router — member app (iOS/Android)
  admin/        React + Vite — Social Cup team admin panel
  barista/      React + Vite — lightweight cafe scan page, no app/account
  api/          Node.js + Express + TypeScript — the one backend
packages/
  database/     Drizzle ORM schema, migrations, Postgres client
  types/        Shared TypeScript types (API envelope, pagination)
  validation/   Shared Zod schemas (env parsing, common validators)
  config/       Shared tsconfig + ESLint presets
  utils/        Shared framework-agnostic utilities
infrastructure/ Terraform: dev/staging/production AWS environments
docs/            Architecture, ADRs, phases, open questions — see docs/product/prd.md first
```

## Prerequisites

- Node.js 20+ (`.nvmrc` pins this)
- pnpm 9+ (`corepack enable` will pick up the pinned version in `package.json`)
- Docker (for local Postgres + mail catcher) — **not installed in the environment this
  foundation was built in; local database startup has not been verified end-to-end. Install
  Docker Desktop (or an equivalent) before running `pnpm infra:up`.**

## Getting started

```bash
pnpm install

# Start local Postgres + maildev (SMTP catcher, UI at http://localhost:1080)
pnpm infra:up

# Copy every app's .env.example to .env and fill in values
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/barista/.env.example apps/barista/.env
cp apps/mobile/.env.example apps/mobile/.env
cp packages/database/.env.example packages/database/.env

# Run everything (each app's dev script, in parallel, via Turborepo)
pnpm dev

# Or run one app at a time
pnpm --filter @social-cup/api dev
pnpm --filter @social-cup/admin dev
pnpm --filter @social-cup/barista dev
pnpm --filter @social-cup/mobile dev
```

`apps/api` listens on `http://localhost:3000` — `GET /health` for liveness, `GET /health/ready`
for a database-connectivity check. `apps/admin` on `:5173`, `apps/barista` on `:5174`,
`apps/mobile` via the Expo CLI (press `i`/`a`/`w`).

## Common commands (from the repo root)

```bash
pnpm build       # turbo run build — every app/package, dependency-ordered
pnpm typecheck   # turbo run typecheck
pnpm lint        # turbo run lint
pnpm test        # turbo run test
pnpm format      # prettier --write across the repo

pnpm db:generate # generate a Drizzle migration from packages/database/src/schema
pnpm db:migrate  # apply pending migrations
pnpm db:studio   # browse the local database

pnpm infra:up    # docker compose up -d (Postgres + maildev)
pnpm infra:down  # docker compose down
```

Every command above works on a single app/package too:
`pnpm --filter @social-cup/api <script>`.

## Where to look next

- [CLAUDE.md](CLAUDE.md) — the rules this codebase is built and extended under (read this
  first if you're about to write code here).
- [docs/product/prd.md](docs/product/prd.md) — the product spec.
- [docs/architecture/](docs/architecture/) — system, database, auth, payments, redemption, and
  infrastructure architecture.
- [docs/development/phases.md](docs/development/phases.md) — what's built, what's next, in what
  order.
- [docs/decisions/open-questions.md](docs/decisions/open-questions.md) — everything ambiguous or
  unresolved, and who owns resolving it.
- [docs/adr/](docs/adr/) — why the non-obvious choices were made.
