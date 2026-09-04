# System Architecture

## Overview

Social Cup runs one mobile app for members and two web surfaces — an admin panel for the Social
Cup team, and a scan page for baristas — on top of a single Node.js/Express backend. All
persistent records live in PostgreSQL on AWS RDS. Photos live in S3, served through CloudFront.
Stripe owns subscription billing and payment collection; the backend only reacts to Stripe
webhooks and never stores card data. See [docs/product/prd.md](../product/prd.md) Section 4 for
the PRD's own architecture summary — this document expands it into concrete component
boundaries and request flow.

```
                              ┌─────────────────────┐
                              │   Stripe (billing)   │
                              └──────────┬───────────┘
                                         │ webhooks
┌────────────┐   HTTPS    ┌─────────────▼─────────────┐    ┌───────────────┐
│ Mobile app  │───────────▶│                            │───▶│  PostgreSQL   │
│ (Expo/RN)   │            │   apps/api                 │    │  (AWS RDS)    │
└────────────┘            │   Node.js + Express        │    └───────────────┘
┌────────────┐   HTTPS    │   REST API, one process    │    ┌───────────────┐
│ Admin panel │───────────▶│   per ECS/Fargate task,    │───▶│  S3 + CloudFront│
│ (React/Vite)│            │   behind an ALB            │    │  (cafe/drink   │
└────────────┘            │                            │    │   photos)      │
┌────────────┐   HTTPS    │                            │    └───────────────┘
│ Barista scan│───────────▶│                            │───▶  Amazon SES
│ (React/Vite)│            └────────────────────────────┘      (transactional email)
└────────────┘
```

Every client — mobile, admin, barista — talks to the same versioned REST API
(`/api/v1/...`; see `apps/api/README.md`). There is no BFF-per-client layer; access control
differences between roles (Member, Visitor, Barista, Administrator) are enforced by
authorization middleware/policy inside the one API, not by exposing different services.

## Components

### apps/mobile — Member mobile app

React Native + Expo + Expo Router, one codebase for iPhone and Android. Talks to `apps/api` over
HTTPS. Renders the Stripe payment sheet in-process (Stripe React Native SDK) rather than
redirecting to a browser — see [docs/architecture/payments.md](payments.md).

### apps/admin — Platform administrator panel

React + Vite SPA. Talks to `apps/api` over HTTPS with an authenticated session (administrator
role). Uses TanStack Query for all server state — no separate client-side store duplicating
server data.

### apps/barista — Cafe scan page

React + Vite SPA, deliberately the smallest surface: no account system of its own, no client
routing framework beyond what's needed for a PIN-gate → scan → result flow. Trust for a device is
established by a per-cafe PIN (see [docs/architecture/redemption.md](redemption.md)), not by a
user login — cafes were explicitly scoped to need no account (PRD Module 8, Target Audience).

### apps/api — Backend REST API

Node.js + Express + TypeScript, the only service that talks directly to PostgreSQL, Stripe's
API, S3, and SES. Every credit-affecting operation (grant, deduct, reset, void) happens here and
only here — see the financial rules in the root [CLAUDE.md](../../CLAUDE.md). Deployed as a
container on ECS/Fargate behind an Application Load Balancer; horizontally scalable (stateless
process — no in-memory session state that isn't safe to lose when a task recycles, aside from the
documented rate-limit-store caveat in
[docs/decisions/open-questions.md](../decisions/open-questions.md)).

### packages/database — Schema, migrations, DB client

Drizzle ORM against PostgreSQL. Owned exclusively by `apps/api` at runtime — no other app or
package opens a direct database connection. See
[docs/architecture/database-architecture.md](database-architecture.md).

### packages/types, packages/validation, packages/utils, packages/config

Shared, framework-agnostic code with no product/business logic: `types` (shared TS interfaces —
API envelope shapes, pagination), `validation` (shared Zod schemas — env parsing, common field
validators), `utils` (id generation, time helpers), `config` (shared tsconfig/eslint presets).
None of these packages know what a "cafe" or a "credit" is — domain types are introduced
alongside the schema/feature that owns them, in a later phase.

## Request flow example: a member opens the Discover screen (post-foundation)

1. Mobile app sends `GET /api/v1/cafes?lat=...&lng=...` with an access token in `Authorization`.
2. `apps/api`: auth middleware verifies the access token → attaches the member id/role to the
   request → route handler queries `packages/database` → response shaped as
   `ApiSuccessResponse<Cafe[]>` (see `packages/types`).
3. Every log line and error response for that request carries the same `X-Request-Id` (see
   `apps/api/src/middleware/requestId.ts`), so a single request can be traced end-to-end through
   CloudWatch even across retries.

## Environments

Three AWS environments — development, staging, production — each with its own VPC, RDS instance,
S3 bucket, and ECS service, provisioned from the same Terraform modules with different sizing
(see [docs/architecture/infrastructure.md](infrastructure.md)). Local development does not use
AWS at all: `docker-compose.yml` at the repo root runs Postgres + a local SMTP catcher
(maildev), and `apps/api` runs directly via `pnpm dev`.

## Cross-cutting concerns

- **Authentication** — see [docs/architecture/authentication.md](authentication.md).
- **Payments** — see [docs/architecture/payments.md](payments.md).
- **Redemption concurrency** — see [docs/architecture/redemption.md](redemption.md).
- **Monitoring** — Sentry across all four apps (mobile, admin, barista, api) for error/crash
  reporting; CloudWatch for API logs and infrastructure metrics. Sentry DSNs are per-app,
  configured via environment variables, never hardcoded.
- **Security headers, CORS, rate limiting** — enforced centrally in `apps/api` (helmet, an
  explicit origin allowlist, `express-rate-limit`); see `apps/api/src/app.ts` and
  `apps/api/README.md`.
