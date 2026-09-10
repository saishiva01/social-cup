# Testing Strategy

## Tooling

| Layer                                                   | Tool                                                                                                                  | Where                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unit / component (all TS packages, api, admin, barista) | Vitest                                                                                                                | `**/src/__tests__/**` next to the code it tests                                                                          |
| Unit / component (mobile)                               | Jest (`jest-expo` preset) + `@testing-library/react-native`                                                           | `apps/mobile/src/__tests__/`                                                                                             |
| API integration                                         | Vitest + Supertest, against `createApp()` directly (in-process, no network hop)                                       | `apps/api/src/__tests__/`                                                                                                |
| DB-backed API integration                               | Vitest + Supertest against `createApp()` with a **real PostgreSQL** instance (`apps/api/src/__tests__/helpers/db.ts`) | `apps/api/src/__tests__/*.integration.test.ts`                                                                           |
| Web E2E (admin, barista)                                | Playwright                                                                                                            | Introduced alongside the first real user flow worth testing end-to-end — not scaffolded speculatively in this foundation |
| Mobile E2E                                              | Deferred — see "What's explicitly deferred" below                                                                     | —                                                                                                                        |

Every app's `test` script is wired into `turbo run test`, so `pnpm test` from the repo root runs
the full suite across every package with dependency-aware caching.

## What's tested at each layer

- **Packages (`types`, `validation`, `utils`, `database`)** — pure unit tests. `validation`'s
  `parseEnv` and `database`'s `env.ts` are tested directly since a bug there fails every app at
  startup, silently in the worst case (a wrong default swallowing a real misconfiguration).
- **`apps/api`** — integration tests build the Express app in-process (`createApp({ client })`)
  and exercise it with Supertest, rather than mocking Express internals. `src/__tests__/health.test.ts`
  is the current example: liveness returns 200, unknown routes return the standard error
  envelope with a request id. As product routes are added, each gets the same treatment —
  request in, response shape and status asserted out.
- **`apps/api` (DB-backed)** — the auth, profile, entitlements, membership, redemption, and
  barista suites (`auth.integration.test.ts`, `profile.integration.test.ts`,
  `entitlements.integration.test.ts`, `membership.integration.test.ts`,
  `redemptions.integration.test.ts`, `barista.integration.test.ts`) run against a real
  Postgres database (the local Docker instance; see the root `docker-compose.yml`), because
  unique constraints, FK cascades, atomic token consumption, refresh-rotation, webhook
  idempotency, and redemption-code concurrency behavior are the point — a mocked ORM cannot prove
  them.
  `membership.integration.test.ts` never calls real Stripe: `helpers/fakeStripeService.ts` fakes
  every network-calling Stripe SDK method but delegates signature verification to the real
  `stripe` package's local (non-network) `webhooks.constructEvent`/`generateTestHeaderString`, so
  the signature-verification and idempotency tests exercise real cryptographic/transactional
  behavior, not a stub of it — including a test that forces a webhook transaction to fail
  mid-processing and asserts an identical retry still fully succeeds (ADR-0011). They connect via
  `TEST_DATABASE_URL`
  (`postgres://social_cup:social_cup_dev@localhost:5433/social_cup_test` locally — create the
  `social_cup_test` database once), run the real Drizzle migrations in `beforeAll`, and
  truncate between tests. **When `TEST_DATABASE_URL` is unset the suites skip** so `pnpm test`
  still works without Docker; CI/dev should set it. Emails are captured by a recording
  `EmailService` (see `helpers/app.ts`) — tests never send real mail. Test files run serially
  (`apps/api/vitest.config.ts`) because the DB-backed files share one database and truncate it
  in `beforeEach`.
- **`apps/admin`, `apps/barista`** — component tests with Testing Library, asserting on rendered
  output/roles, not implementation details (no snapshot tests of internal component structure).
- **`apps/mobile`** — same philosophy via `@testing-library/react-native`.

## The one non-negotiable test class: credit ledger and redemption concurrency

PRD Module 10.1 requires, verbatim: _"Concurrency testing on the credit ledger, including two
devices scanning one code at the same moment,"_ and _"Expiry, replay, and retry testing across
the full redemption flow."_ This is not ordinary feature testing — it's the test suite that
proves the design in [docs/architecture/redemption.md](../architecture/redemption.md) actually
holds under concurrency, not just in the single-request happy path a normal integration test
covers.

**Implemented** — `apps/api/src/__tests__/barista.integration.test.ts` and
`redemptions.integration.test.ts` cover, at minimum:

1. **Concurrent-scan test:** fires 2 simultaneous `POST /barista/redeem` requests for the same
   code against a real Postgres instance (not a mock — the whole point is proving the database
   transaction/locking behavior — via `Promise.all`) and asserts exactly one succeeds (200) and
   the other returns the "already redeemed" red result (409), with exactly one negative ledger
   entry and the balance never negative.
2. **Expiry test:** a code past its five-minute window is rejected even though it was never
   scanned, and deducts nothing.
3. **Replay test:** re-submitting an already-consumed code (sequentially, not concurrently)
   returns "already redeemed," never a second deduction.
4. **Wrong-cafe test:** a code generated for cafe A is rejected ("not valid at this cafe") when a
   device trusted for cafe B submits it.
5. **Post-claim-failure test:** a scan whose atomic claim succeeds but a later check fails (e.g.
   credits drained between code creation and scan) rolls the code back to `pending` — proving the
   whole transaction, not just the claim, is atomic.

These run against a real database (the local Docker Postgres, or CI once configured — not a mock
ORM layer) — a mocked database cannot prove a transaction/locking strategy is actually race-free.

## Cross-browser / cross-device regression (PRD Module 10.1)

"Full regression on iPhone and Android" and "cross-browser testing on the admin panel and scan
page" are manual/device-lab UAT activities per the PRD, not something this foundation automates.
Playwright, once introduced, covers cross-_browser_ automated regression for the two web apps;
device-level mobile regression stays a manual UAT step per the PRD's own Module 10.2 acceptance
criteria ("client user acceptance testing on real devices, at a real cafe counter").

## CI

No CI pipeline is defined yet in this repository (tracked in
[docs/development/phases.md](phases.md) as deferred alongside the rest of Module 1's CI/CD
requirement). When it's added, it should run, per pull request: `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — the same commands documented in the
root `README.md` for local verification, so CI never diverges from what a developer can run
themselves.

## What's explicitly deferred

- Playwright E2E suites — introduced with the first real flow, not scaffolded against screens
  that don't exist yet.
- Load/performance testing — not called for by the PRD at Phase 1's scale.
- Mobile automated E2E (Detox/Maestro) — the PRD's acceptance criteria for mobile is manual UAT
  on real devices, not automated E2E; revisit if that changes.
