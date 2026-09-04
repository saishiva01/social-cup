# CLAUDE.md

Instructions for any Claude Code session (or human) working in this repository. Read this before
writing code here.

## Project overview

Social Cup is a Dallas coffee membership platform. Members pay $24.99/month for 30 drink
credits, spend them on real drinks at partner cafes by showing a code at the counter, and rate
individual drinks rather than cafes as a whole. It ships as a React Native mobile app, a React
admin panel, a lightweight React barista scan page, and one Node.js/Express backend on
PostgreSQL, deployed to AWS. Full detail: [docs/product/prd.md](docs/product/prd.md).

## PRD authority

**`SOCIAL_CUP_Proposal_Final 6.pdf`** (repo root) is the authoritative product specification.
[docs/product/prd.md](docs/product/prd.md) is a cleaned-up transcription of it for day-to-day
reference — if the two ever disagree, the PDF wins.

- Do not invent product requirements. If a feature's behavior isn't specified, don't guess a
  plausible-sounding one and build it.
- Do not silently resolve an ambiguity. If the PRD is unclear, contradicts itself, or a decision
  needs a product owner, add it to
  [docs/decisions/open-questions.md](docs/decisions/open-questions.md) with enough context for
  someone to actually answer it, and say so out loud in your response — don't pick a reading and
  move on quietly. Check that file at the start of work on anything it might cover.

## Architecture

One backend (`apps/api`), three frontends (`apps/mobile`, `apps/admin`, `apps/barista`), all
talking to the same versioned REST API. One database (PostgreSQL via `packages/database`),
owned exclusively by `apps/api` — no other app or package ever opens a direct connection to it.
Stripe owns billing; the backend reacts to webhooks, never to client-reported payment success.

Read before touching the relevant area:

- [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) — component map, request flow.
- [docs/architecture/database-architecture.md](docs/architecture/database-architecture.md) — schema rules, migration workflow.
- [docs/architecture/authentication.md](docs/architecture/authentication.md) — token strategy, social sign-in.
- [docs/architecture/payments.md](docs/architecture/payments.md) — Stripe integration, webhook-driven state.
- [docs/architecture/redemption.md](docs/architecture/redemption.md) — the concurrency-safe redemption pattern. **Read this before touching anything that deducts a credit.**
- [docs/architecture/infrastructure.md](docs/architecture/infrastructure.md) — AWS/Terraform.
- [docs/adr/](docs/adr/) — why, for every non-obvious choice above.

## Repository structure

```
apps/mobile     Expo + Expo Router + TypeScript — member app
apps/admin      React + Vite + TypeScript + React Router + TanStack Query + Tailwind — admin panel
apps/barista    React + Vite + TypeScript — cafe scan page
apps/api        Node.js + Express + TypeScript + Zod + Drizzle — the backend
packages/database    Drizzle schema, migrations, DB client — apps/api-only at runtime
packages/types       Shared TS types, no domain/business logic
packages/validation  Shared Zod schemas, no domain/business logic
packages/config      Shared tsconfig + ESLint presets
packages/utils       Shared framework-agnostic utilities
infrastructure  Terraform: modules/ + environments/{dev,staging,production}
docs             Product, architecture, ADRs, phases, open questions
```

pnpm workspaces + Turborepo + TypeScript project references — see
[ADR-0001](docs/adr/0001-monorepo-tooling.md). Internal package references always use
`workspace:*`. A new shared module goes in `packages/`, not copy-pasted into each app.

## Coding conventions

- TypeScript everywhere, `strict: true`. No `any` without a comment explaining why it's
  unavoidable there.
- No comments explaining *what* code does — names should do that. A comment is for a non-obvious
  *why* (a constraint, an invariant, a workaround). This applies to code you write in this repo,
  matching the style already in `apps/api/src/*`.
- Don't add abstractions, config flags, or generalized "for later" code for requirements that
  don't exist yet. Three similar lines beat a premature shared helper. This is explicitly why
  `packages/database/src/schema/` is empty and `packages/types` holds only generic,
  domain-free types — see [docs/development/phases.md](docs/development/phases.md).
- Follow the ESLint/Prettier config already in each package (`packages/config`) rather than
  introducing a different style locally. `pnpm lint` / `pnpm format` before considering work
  done.
- Cross-file imports inside `apps/api` and `packages/*` use explicit `.js` extensions (Node ESM
  requirement under `moduleResolution: NodeNext`); the Vite/Expo apps use extensionless imports
  (bundler resolution) — match whichever convention the file you're editing already uses.

## Security rules

- **Never commit a secret.** Every app/package that needs environment variables has a committed
  `.env.example` with placeholders or generation instructions — real values go in a git-ignored
  `.env`. Deployed environments read secrets from AWS Secrets Manager
  ([ADR-0007](docs/adr/0007-secrets-management.md)), never from a plain ECS environment variable
  or a value written into a `.tf` file.
- **Never expose database credentials to a client.** Only `apps/api` connects to PostgreSQL.
- Validate every environment variable at startup with Zod (`parseEnv` from
  `@social-cup/validation`) and fail fast, listing every problem at once — see
  `apps/api/src/env.ts`. Don't add a new required config value that's read ad hoc from
  `process.env` elsewhere.
- CORS is an explicit origin allowlist (`CORS_ALLOWED_ORIGINS`), never a wildcard or reflected
  origin — see `apps/api/src/config/cors.ts`.
- Security headers via `helmet()`, applied globally in `apps/api/src/app.ts` — don't disable a
  header to work around a client-side issue without understanding why it was there.
- Rate limiting is applied globally (`apps/api/src/middleware/rateLimit.ts`) with a documented
  gap for multi-instance deployment — see
  [open-questions.md #6](docs/decisions/open-questions.md#6-rate-limit-store-for-multi-instance-deployment)
  before assuming it's sufficient for a scaled-out production API.
- Only `VITE_`-prefixed (admin/barista) or `EXPO_PUBLIC_`-prefixed (mobile) environment variables
  are readable client-side — never put a secret behind either prefix.
- Every error response and log line carries a request/correlation id
  (`apps/api/src/middleware/requestId.ts`) — this is the audit-logging foundation; extend it
  rather than adding a parallel logging mechanism.

## Database rules

- `packages/database` owns the schema and migrations. One file per domain area under `src/schema/`,
  re-exported from `schema/index.ts`. Generate migrations (`pnpm db:generate`), review the SQL,
  commit schema change + migration together. Never run `drizzle-kit push` against staging or
  production. Full workflow: `packages/database/README.md`.
- Model the credit balance as an append-only ledger, not a mutable counter column —
  [ADR-0003](docs/adr/0003-credit-ledger-append-only.md).
- Every redemption stores the cafe's payout rate *at the moment it happened*, not a live
  reference to the cafe's current rate (PRD 7.5) — a later rate change must never alter a past
  statement.
- A void is a new, audited reversing entry (who + reason), never a delete or silent update of the
  original record (PRD 9.7).

## Financial rules — the ones that don't get relaxed under time pressure

**Credits and redemption are server-authoritative. Never trust the mobile app for credit balance
or redemption success.** Concretely:

- Every credit grant is driven by a verified Stripe webhook event, never by the client reporting
  "the payment sheet said success" — see
  [ADR-0005](docs/adr/0005-webhook-driven-payments.md).
- The client displaying "Redeemed" or a green scan result is not itself proof anything happened
  server-side — the API's response to the redemption request is the only source of truth, and the
  PRD is explicit that a barista must never accept a member's own screen as proof (Module 8.4).
- **Redemption must use a database transaction with concurrency protection. Two simultaneous
  scans of the same code must never result in two successful redemptions.** The required pattern
  — a single atomic conditional `UPDATE ... WHERE status = 'active' ... RETURNING`, in the same
  transaction as the ledger deduction — is specified in
  [docs/architecture/redemption.md](docs/architecture/redemption.md) and
  [ADR-0006](docs/adr/0006-redemption-concurrency-strategy.md). Do not implement redemption
  consumption as a separate read-then-write; that reintroduces the exact race this design exists
  to prevent.
- Every Stripe webhook handler must be idempotent (keyed on Stripe's event id) — Stripe redelivers
  events, and a redelivered `invoice.paid` must not grant credits twice.

## Testing rules

- `pnpm test` (Turborepo, every package) must pass before calling anything done.
- API changes get integration tests against `createApp()` with Supertest — in-process, not a
  live server — see `apps/api/src/__tests__/health.test.ts` as the pattern to follow.
- Anything that touches the credit ledger or redemption code path needs a concurrency test (fire
  simultaneous requests, assert exactly one succeeds) in addition to the happy-path test — see
  [docs/development/testing-strategy.md](docs/development/testing-strategy.md). This is not
  optional coverage; it's the PRD's own QA requirement (Module 10.1).
- Test against a real Postgres instance for anything concurrency-sensitive — a mocked ORM layer
  cannot prove a transaction/locking strategy is race-free.
- Full tooling breakdown: [docs/development/testing-strategy.md](docs/development/testing-strategy.md).

## Git rules

- Create new commits; don't amend or force-push published history without being explicitly asked.
- Never commit a `.env` file, a real Terraform `.tfvars`/`backend.hcl`, or any value that
  belongs in Secrets Manager. Check `git status`/`git diff` before committing anything that
  touches config.
- Don't skip hooks (`--no-verify`) or bypass signing to get past a failing check — fix the
  underlying issue.
- A schema change ships as one commit containing both the Drizzle schema edit and its generated
  migration file — never split across commits or left uncommitted.

## Phase boundaries

- **Phase 0 (current)** — this engineering foundation. No product feature.
- **Phase 1** — everything In Scope in [docs/product/prd.md](docs/product/prd.md) Section 3 /
  Modules 1–10. Suggested build order and per-module gates:
  [docs/development/phases.md](docs/development/phases.md).
- **Phase 2** — everything Out of Scope in the PRD. See below.

### Prohibited in this phase (Phase 0)

Do not implement, even partially or as a "quick start": authentication screens/flows, cafe
discovery, drink ratings, membership/credits, Stripe subscription logic, credits, redemption,
admin CRUD, or barista scanning. If a task description asks for one of these, stop and confirm
scope rather than building toward it — this repository's current job is the foundation those
features get built on, not the features themselves.

### Prohibited Phase 2 features (do not build without an explicit new decision)

Self-service cafe portal for menus/pricing; automated bank payouts to cafes; push notifications;
analytics/reporting beyond CSV export; ranking that responds automatically to community activity;
mid-cycle credit top-ups; order-ahead/collection; offline scanning; any social/connections
feature (groups, activity feed, saved-cafe overlap with connections, meetup planning). A
Stripe-Checkout-web fallback for membership signup is conditional — see
[open-questions.md #3](docs/decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback).

## Instructions for future Claude sessions

1. **Read [docs/decisions/open-questions.md](docs/decisions/open-questions.md) before working on
   anything it lists.** If you hit a new ambiguity, add it there with enough context for a
   product owner to actually resolve it — don't guess and move on.
2. **Check [docs/development/phases.md](docs/development/phases.md) before adding a feature.**
   If it's not in the current phase, say so instead of building it.
3. **Read the relevant `docs/architecture/*.md` and its linked ADR(s) before touching
   authentication, payments, or redemption code.** These three areas have specific,
   non-obvious-by-default correctness requirements (webhook-driven state, atomic redemption
   consumption, token rotation) that are easy to accidentally simplify away under time pressure.
4. **Don't claim something works without having run it.** `pnpm typecheck`, `pnpm lint`,
   `pnpm test`, and the relevant `pnpm build`/`dev` are cheap to run before saying a change is
   done — do that instead of asserting it from reading the diff.
5. **Update the docs you touch.** A schema change updates
   `docs/architecture/database-architecture.md` if it changes a stated rule; an infra change
   updates `infrastructure/README.md`/`docs/architecture/infrastructure.md`; a resolved open
   question gets removed (or marked resolved with the answer) from
   `docs/decisions/open-questions.md`, not left stale.
6. **This foundation was built without a local `terraform` binary, and without Docker installed**
   in that session's environment — `infrastructure/` has never been `terraform plan`'d against
   real AWS credentials, and local Postgres/`docker compose` startup has never been verified
   end-to-end. Don't assume either has been validated; verify before relying on them.
