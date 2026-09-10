# @social-cup/barista

Social Cup barista scan page. A lightweight React + Vite web page — no app, no account. A cafe
enters a PIN once per device, then that device stays trusted (PRD Module 8).

## Status

**Implemented (Phase 5).** PIN entry (per-cafe, bcrypt-hashed server-side), an httpOnly
trusted-device cookie that persists across visits, manual code/backup-code entry and redemption
(POST `/api/v1/barista/redeem`), the green/red result screen, and a "Today's redemptions" list —
see [docs/architecture/redemption.md](../../docs/architecture/redemption.md).

**Not implemented:** camera/QR scanning — the PRD describes a camera-based flow, but this phase
implements manual code entry only (see that doc's "What's explicitly deferred"); the architecture
does not block adding a scanner later that feeds the same input. No router is used — the app has
exactly one meaningful route, the café id read from the URL
(`https://scan.socialcup.app/<cafeId>`, or `?cafeId=` for local testing), parsed in
`src/lib/cafeId.ts`.

## Running locally

```
cp apps/barista/.env.example apps/barista/.env
pnpm --filter @social-cup/barista dev
```

Runs on http://localhost:5174. Visit `http://localhost:5174/<cafeId>` (a cafe id from
`pnpm --filter @social-cup/database db:seed`) — the seeded PIN is `1234` for every seeded café.
