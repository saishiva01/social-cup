# @social-cup/barista

Social Cup barista scan page. A lightweight React + Vite web page — no app, no account. A cafe
enters a PIN once per device, then that device stays trusted (PRD Module 8).

## Status

Foundation only: bare Vite/React shell. PIN entry, camera scanning (QR), the six-digit backup
code, and the green/red validation result are built in a later phase — see
[docs/development/phases.md](../../docs/development/phases.md).

## Running locally

```
cp apps/barista/.env.example apps/barista/.env
pnpm --filter @social-cup/barista dev
```

Runs on http://localhost:5174.
