# @social-cup/admin

Social Cup admin panel. React + Vite + TypeScript + React Router + TanStack Query + Tailwind CSS.

## Status

Foundation only: routing shell, TanStack Query client, Tailwind, and a placeholder dashboard
route. Cafe management, redemption log, payouts, and member management (PRD Module 9) are
built in a later phase — see [docs/development/phases.md](../../docs/development/phases.md).

## Running locally

```
cp apps/admin/.env.example apps/admin/.env
pnpm --filter @social-cup/admin dev
```

Runs on http://localhost:5173.

## Notes

Only environment variables prefixed `VITE_` are readable in the browser bundle — Vite embeds
them at build time. Never put a secret behind a `VITE_` variable.
