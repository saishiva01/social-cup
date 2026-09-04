# Testing Strategy

## Tooling

| Layer | Tool | Where |
|---|---|---|
| Unit / component (all TS packages, api, admin, barista) | Vitest | `**/src/__tests__/**` next to the code it tests |
| Unit / component (mobile) | Jest (`jest-expo` preset) + `@testing-library/react-native` | `apps/mobile/src/__tests__/` |
| API integration | Vitest + Supertest, against `createApp()` directly (in-process, no network hop) | `apps/api/src/__tests__/` |
| Web E2E (admin, barista) | Playwright | Introduced alongside the first real user flow worth testing end-to-end — not scaffolded speculatively in this foundation |
| Mobile E2E | Deferred — see "What's explicitly deferred" below | — |

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
- **`apps/admin`, `apps/barista`** — component tests with Testing Library, asserting on rendered
  output/roles, not implementation details (no snapshot tests of internal component structure).
- **`apps/mobile`** — same philosophy via `@testing-library/react-native`.

## The one non-negotiable test class: credit ledger and redemption concurrency

PRD Module 10.1 requires, verbatim: *"Concurrency testing on the credit ledger, including two
devices scanning one code at the same moment,"* and *"Expiry, replay, and retry testing across
the full redemption flow."* This is not ordinary feature testing — it's the test suite that
proves the design in [docs/architecture/redemption.md](../architecture/redemption.md) actually
holds under concurrency, not just in the single-request happy path a normal integration test
covers.

When Module 8 is built, its test suite must include, at minimum:

1. **Concurrent-scan test:** fire N (≥ 2) simultaneous redemption requests for the same code
   against a real Postgres instance (not a mock — the whole point is proving the database
   transaction/locking behavior) and assert exactly one succeeds and the rest return the
   "already used" red result.
2. **Expiry test:** a code past its five-minute window is rejected even if it was never scanned.
3. **Replay test:** re-submitting an already-consumed code (sequentially, not concurrently)
   returns "already used," never a second deduction.
4. **Wrong-cafe test:** a code generated for cafe A rejected when scanned at cafe B's scan page.
5. **Dropped-connection test:** a request that fails mid-flight (simulated) leaves the code
   `active` and the member's credits untouched — no partial deduction.

These run against a real database (the local Docker Postgres in CI, not a mock ORM layer) — a
mocked database cannot prove a transaction/locking strategy is actually race-free.

## Cross-browser / cross-device regression (PRD Module 10.1)

"Full regression on iPhone and Android" and "cross-browser testing on the admin panel and scan
page" are manual/device-lab UAT activities per the PRD, not something this foundation automates.
Playwright, once introduced, covers cross-*browser* automated regression for the two web apps;
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
