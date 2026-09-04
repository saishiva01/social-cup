# ADR-0001: Monorepo tooling — pnpm workspaces + Turborepo + TypeScript project references

## Status

Accepted.

## Context

Four apps (mobile, admin, barista, api) share code (types, validation schemas, config presets)
and must be developed, typechecked, and tested together without each app vendoring its own copy
of shared logic. The stack was specified as pnpm + Turborepo + TypeScript (given, not chosen
here) — this ADR records how those three are wired together.

## Decision

- **pnpm workspaces** (`pnpm-workspace.yaml`) for dependency installation and linking —
  `workspace:*` protocol for internal package references, so `apps/api` always builds against
  the local `packages/database` source, not a published version.
- **Turborepo** (`turbo.json`) for task orchestration — `build`, `dev`, `lint`, `typecheck`,
  `test`, `clean` are declared once as pipeline tasks; `build`/`lint`/`typecheck`/`test` all
  depend on `^build` (their dependencies' build output) so a package's compiled `dist/` is always
  fresh before something that imports it runs. Turborepo's cache means an unchanged package's
  tasks are skipped on repeat runs.
- **TypeScript project references** for the four Node/library packages (`api`, `database`,
  `types`, `utils`, `validation`) — each has `"composite": true` (via
  `packages/config/tsconfig/node.json`) and `apps/api/tsconfig.json` lists them under
  `references`, so `tsc -b` builds them in dependency order and only rebuilds what changed.
  The three Vite/Expo apps (`admin`, `barista`, `mobile`) use plain `tsc --noEmit` for
  typechecking instead — they're leaves in the dependency graph (nothing references their
  output) and Vite/Metro do the actual bundling, so composite-project build semantics add
  complexity without benefit there.

## Consequences

- Adding a new shared package means: create it under `packages/`, add it to the consuming app's
  `dependencies` as `workspace:*`, and (if it's a Node/library package meant to be imported by
  TypeScript source elsewhere) add it to that app's `tsconfig.json` `references`.
- `pnpm install` at the repo root is the only supported install path — never `npm install` or
  `yarn install` inside an individual app directory, which would create a second, disconnected
  lockfile/`node_modules` resolution.
- Turborepo's remote caching is not configured (would require a Vercel account or self-hosted
  cache) — every environment (local, future CI) currently gets local-only caching. Worth
  revisiting once a CI pipeline exists (see [docs/development/phases.md](../development/phases.md)).
