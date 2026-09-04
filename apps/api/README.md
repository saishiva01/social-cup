# @social-cup/api

Social Cup backend REST API. Node.js + Express + TypeScript.

## Status

Foundation only: environment validation, health/readiness endpoints, structured logging,
correlation ids, centralized error handling, CORS, security headers, rate limiting, API
versioning, and graceful shutdown. No product routes exist yet — see
[docs/development/phases.md](../../docs/development/phases.md).

## Running locally

From the repo root:

```
cp apps/api/.env.example apps/api/.env
pnpm infra:up          # starts local Postgres + maildev
pnpm --filter @social-cup/api dev
```

- `GET /health` — liveness (process is up)
- `GET /health/ready` — readiness (can reach the database)
- `GET /api/v1` — versioned API root

## Layout

```
src/
  index.ts          Process entrypoint: starts the server, wires graceful shutdown
  app.ts             Builds the Express app (middleware order matters — see comments)
  env.ts             Zod-validated environment variables, loaded once at startup
  config/cors.ts     Origin allowlist built from CORS_ALLOWED_ORIGINS
  errors/AppError.ts Typed error classes (ValidationError, NotFoundError, ...)
  lib/logger.ts      pino structured logger
  middleware/
    requestId.ts     Correlation id, echoed on response, attached to every log line
    errorHandler.ts  Converts AppError / ZodError / unknown errors into a single response shape
    notFound.ts      404 fallback
    rateLimit.ts     Rate limiting (in-memory — see docs/decisions/open-questions.md)
  routes/
    health.ts        Unversioned liveness/readiness endpoints
    v1/index.ts       Versioned API root (mount new routes here as they're built)
```

## Conventions

- Every route response is either `{ success: true, data }` or
  `{ success: false, error, meta: { requestId } }` (see `@social-cup/types`).
- Throw an `AppError` subclass (or a `ZodError`, thrown automatically by `schema.parse`) —
  never call `res.status(...).json(...)` for an error case directly. The central error
  handler is the only place that shapes error responses.
- New endpoints go under `/api/v1`. A breaking change gets `/api/v2` alongside it, not a
  replacement.
