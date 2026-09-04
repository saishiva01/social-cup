# ADR-0004: Short-lived JWT access token + rotated opaque refresh token

## Status

Accepted (design decision for Module 2 — not yet implemented; see
[docs/development/phases.md](../development/phases.md)).

## Context

PRD Module 2.1 requires "sessions [that] use secure tokens that refresh in the background
without asking the member to log in again," without specifying a mechanism. Three clients
(Expo mobile app, two React web SPAs) need to consume whatever mechanism is chosen, with
meaningfully different secure-storage capabilities (mobile: OS-level secure storage; web:
cookies vs. `localStorage`).

## Decision

- **Access token:** JWT, short-lived (15 minutes), HS256-signed with `ACCESS_TOKEN_SECRET`.
  Carries user id and role/account-state claims for authorization. Verified locally by
  `apps/api` on every request — no database round-trip to check a session table for ordinary
  requests.
- **Refresh token:** opaque random string (not a JWT), long-lived, stored **hashed** server-side
  with an expiry and a rotation-chain id. Exchanging a refresh token for a new access token also
  issues a new refresh token and invalidates the previous one (rotation). Presenting an
  already-rotated (reused) refresh token revokes the entire chain, forcing re-login — the
  standard signal that a refresh token was stolen and replayed.
- **HS256, not RS256/JWKS**, because `apps/api` is currently the only service that ever verifies
  an access token — asymmetric signing exists to let a second, independent service verify tokens
  without holding the signing secret, which doesn't apply yet. Revisit if a second verifying
  service appears.

## Consequences

- Web clients (`admin`, `barista`) store the refresh token in an `httpOnly`, `Secure`,
  `SameSite=Strict` cookie, never `localStorage` — keeps it unreachable from an XSS payload. The
  mobile client uses `expo-secure-store`, not `AsyncStorage`.
- A leaked access token is only useful for ≤15 minutes; a leaked (but not yet used) refresh
  token is caught the moment the legitimate client tries to use its own copy and finds it already
  rotated.
- Requires a refresh-token table (id, hashed token, user id, chain id, expires_at, rotated flag)
  — a small, deliberate amount of server-side session state, in exchange for revocability
  (log out one device, log out all devices via chain revocation) that a pure-JWT/no-refresh-table
  design can't offer.
- `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` are separate secrets (see
  `apps/api/src/env.ts`) so rotating one doesn't force rotating the other, and a bug that
  confuses the two token types can't accidentally make one valid as the other.
