# Authentication Architecture

## Status

No authentication routes, screens, or middleware exist yet (see
[docs/development/phases.md](../development/phases.md)). This document defines the architecture
those routes must implement, so the shape is settled before the first login endpoint is written.
The token strategy below is an **engineering decision**, not a PRD requirement — the PRD (Module
2) specifies outcomes ("secure tokens that refresh in the background") without specifying a
mechanism. See [ADR-0004](../adr/0004-authentication-token-strategy.md).

## Requirements from the PRD (Module 2)

- Email + password, Google Sign-In, and Apple Sign-In (Apple Sign-In is required by Apple
  whenever Google Sign-In is offered on iOS).
- Email verification on signup (link-based).
- Password reset (link-based, expires after one hour).
- Sessions "use secure tokens that refresh in the background without asking the member to log in
  again."
- Two account states layered on top of "authenticated": **Visitor** (registered, not subscribed)
  and **Member** (subscribed) — see
  [open-questions.md #1](../decisions/open-questions.md#1-can-a-visitor-browse-search-and-rate-without-ever-subscribing)
  for the one open question about how strictly these are separated from plain
  "authenticated or not."
- Account deletion (Apple requirement) cancels any active subscription.

## Token strategy

- **Access token:** short-lived (target: 15 minutes) JSON Web Token, signed with
  `ACCESS_TOKEN_SECRET` (HS256 to start — see the ADR for why not RS256 yet). Carries the user id
  and role/account-state claims needed for authorization. Never persisted client-side beyond
  memory/secure storage; never logged (see the redaction list in `apps/api/src/lib/logger.ts`).
- **Refresh token:** long-lived, opaque (not a JWT — a random token), stored **hashed** in the
  database alongside a user id, expiry, and a rotation chain id. Presenting a refresh token
  issues a new access token *and* a new refresh token, and invalidates the one just used
  (rotation). Reusing an already-rotated refresh token is treated as token theft and revokes the
  entire chain — forcing re-login on every device tied to that chain.
- **Storage on each client:**
  - Mobile (Expo): refresh token in secure device storage (`expo-secure-store`), not
    `AsyncStorage`.
  - Admin / barista (web): refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie —
    never in `localStorage`, to keep it unreachable from XSS. The access token can live in
    memory (a JS variable, lost on page reload, refreshed via the cookie) — never in
    `localStorage` either.

## Social sign-in

- **Google Sign-In:** the client obtains an ID token from Google; the backend verifies it against
  Google's public keys, resolves or creates a user record, and issues Social Cup's own
  access/refresh tokens. The backend never sees the user's Google password — only the verified
  ID token claims.
- **Apple Sign-In:** same pattern with Apple's identity token. Apple only sends the user's name
  and email on the *first* authorization — the backend must persist those on first sign-in,
  since Apple will not send them again on subsequent logins.
- Both providers ultimately resolve to the same internal user record type as email/password —
  authorization and account-state logic downstream doesn't branch on how someone signed in.

## Password reset and email verification

Both use a single-use, expiring token (verification: no fixed expiry stated by the PRD, treat as
24h unless product specifies otherwise; password reset: 1 hour per PRD Module 2.2) delivered as a
link via Amazon SES. See [docs/architecture/payments.md](payments.md) for why webhook-style
email sending (queued, retried) matters for reliability — the same reasoning applies to
verification/reset emails: sending must not block the request that triggered it, and must be
retried on transient SES failure.

## Authorization model

Role/state checks (Visitor vs. Member, Barista PIN-trust vs. Administrator) are enforced in
`apps/api` middleware reading claims off the verified access token — never trusted from a
request body or query param. The mobile/admin/barista clients render different UI based on the
same claims, but that's a UX convenience, not a security boundary; every state-gated action (e.g.
redeeming a drink) is re-checked server-side regardless of what the client believes the account
state is. This mirrors the credit/redemption server-authority rule in the root
[CLAUDE.md](../../CLAUDE.md).

Barista access is a separate model entirely — a per-cafe PIN establishes device trust, not a user
login (see [docs/architecture/redemption.md](redemption.md)). It does not use the access/refresh
token scheme above.

## What's explicitly deferred

- Multi-factor authentication — not in the PRD for Phase 1.
- RS256/JWKS-based access tokens (would matter if a second service ever needed to verify tokens
  independently) — HS256 is sufficient while `apps/api` is the only verifier.
- Session/device management UI ("log out of all devices") beyond what refresh-token-chain
  revocation already gives the backend for free.
