# Authentication Architecture

## Status

**Implemented (Phase 1, Module 2).** Email + password registration, email verification,
login, logout, background token refresh, forgot/reset password, and profile exist as the
`/api/v1/auth/*` and `/api/v1/me` endpoints below. Google and Apple sign-in are **UI
placeholders only** — disabled "coming soon" buttons; no OAuth credentials, no token
verification, no fake accounts (see "Social sign-in" below). The token strategy described
here was an engineering decision recorded in [ADR-0004](../adr/0004-authentication-token-strategy.md),
not a PRD requirement.

## Requirements from the PRD (Module 2)

- Email + password, Google Sign-In, and Apple Sign-In (Apple Sign-In is required by Apple
  whenever Google Sign-In is offered on iOS).
- Email verification on signup (link-based).
- Password reset (link-based, expires after one hour).
- Sessions "use secure tokens that refresh in the background without asking the member to log
  in again."
- Two account states layered on top of "authenticated": **Visitor** (registered, not
  subscribed) and **Member** (subscribed). Confirmed as a locked product decision in
  [ADR-0008](../adr/0008-visitor-member-account-states.md): subscription gates redemption and
  credits only — a Visitor gets full browse/search/filter/view/rate/diary access, identical to
  a Member, without ever subscribing. "Authenticated" and "entitled to redeem" are two
  separate checks, not one.
- Account deletion (Apple requirement) cancels any active subscription — **not implemented in
  Phase 1**; it is deferred because it must cancel a Stripe subscription (Phase 4) and is
  tracked as a known limitation.

## Token strategy (as implemented)

- **Access token:** short-lived (15 minutes) JSON Web Token, signed with `ACCESS_TOKEN_SECRET`
  (HS256). Carries the user id (`sub`) and email. Never persisted client-side beyond memory;
  never logged (see the redaction list in `apps/api/src/lib/logger.ts`).
- **Refresh token:** long-lived (30 days), opaque (a random 32-byte hex string, not a JWT),
  stored **hashed** (SHA-256) in `refresh_tokens` alongside a user id, expiry, a rotation chain
  id, and `rotated_at`/`revoked_at` timestamps. Presenting a refresh token issues a new access
  token _and_ a new refresh token, and invalidates the one just used (rotation) via an atomic
  conditional `UPDATE ... WHERE rotated_at IS NULL ...` — the same concurrency discipline as
  the redemption pattern in [docs/architecture/redemption.md](redemption.md), so two
  simultaneous rotations of one token cannot both succeed. Reusing an already-rotated refresh
  token is treated as token theft and revokes the **entire chain** (`chain_id`), forcing
  re-login on every device tied to it. Clients must single-flight their refresh calls — the
  mobile client does (`AuthProvider.refreshSession`).
- **Storage on each client:**
  - Mobile (Expo): refresh token in `expo-secure-store` (key `socialcup.refreshToken`), never
    `AsyncStorage`. The access token lives only in memory in `AuthProvider` and is never
    persisted. Expo Go compatible — no native modules beyond expo-secure-store.
  - Admin / barista (web): refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie —
    never in `localStorage`. Not yet implemented (no web auth surface in Phase 1); the
    `/auth/refresh` endpoint already returns the token in the body, so the cookie storage can
    be layered onto the same endpoint when a web client needs it.

## API surface (Phase 1)

All under `/api/v1`, all bodies validated with shared Zod schemas
(`packages/validation/src/auth.ts`), all responses in the `{ success, data }` / error envelope.

| Endpoint                         | Purpose                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`            | Create account (email, password, display name). Hashes the password (bcrypt cost 12), issues a 24-hour verification token, emails it. Returns an identical generic body whether the account was created or already exists (no enumeration); a duplicate unverified account silently gets a fresh verification email. No session is issued — the user must verify first. |
| `POST /auth/verify-email`        | Consume a verification token atomically (single-use, 24h expiry). Sets `email_verified_at`. Idempotent for already-verified accounts.                                                                                                                                                                                                                                   |
| `POST /auth/resend-verification` | Re-issues a verification email for an unverified account. Silent no-op for unknown/verified accounts; rate limited.                                                                                                                                                                                                                                                     |
| `POST /auth/login`               | Email + password → `{ tokens, user }`. Same "Invalid email or password" error for unknown email and wrong password. An unverified account (correct password) gets `403 EMAIL_NOT_VERIFIED` — distinguishable only to someone who already knows the password.                                                                                                            |
| `POST /auth/refresh`             | Rotate the refresh token (see above). Returns fresh `{ tokens }`.                                                                                                                                                                                                                                                                                                       |
| `POST /auth/logout`              | Body carries the refresh token (no access token needed — the client's access token may already be expired). Revokes the whole chain. Idempotent.                                                                                                                                                                                                                        |
| `POST /auth/forgot-password`     | Always answers "if an account exists, a link has been sent" — identical body whether or not the account exists. Issues a 1-hour reset token and emails it.                                                                                                                                                                                                              |
| `POST /auth/reset-password`      | Consume a reset token atomically (single-use, 1h expiry), set the new password, and revoke **all** refresh tokens for the account (a credential change kills every session).                                                                                                                                                                                            |
| `GET /me`                        | Authenticated user's safe profile (`requireAuth`).                                                                                                                                                                                                                                                                                                                      |
| `PATCH /me`                      | Update display name, profile photo URL, coffee preferences, neighbourhood. Server-controlled fields (role, verification, security state) are unreachable.                                                                                                                                                                                                               |

Rate limits (per IP, 15-minute window, in-memory store — see
[open-questions.md #6](../decisions/open-questions.md#6-rate-limit-store-for-multi-instance-deployment)
for the multi-instance caveat): register 10, login 10, resend-verification 5, forgot-password
5, reset-password 10, refresh 60. Limiters are created per app instance, not shared module
singletons.

## Email verification and password reset

Both use single-use, expiring tokens delivered as links via the `EmailService` abstraction
(`apps/api/src/services/email/`) — a route never touches the provider. The link is a real HTTPS
URL built from the `APP_WEB_URL` env var (a trusted server config value, never user input) plus
`/verify-email` or `/reset-password` and a `token` query parameter — e.g.
`https://socialcup.app/verify-email?token=...`. `APP_WEB_URL` points at `apps/web`, the small
public web app that hosts those two routes (see `apps/web/README.md`); locally it defaults to
`apps/web`'s dev server (`http://localhost:5175`). Verification is treated as 24h per this
document's earlier note (the PRD states no fixed expiry); password reset is 1 hour per PRD
Module 2.2.

**Why a web link and not a mobile deep link (`socialcup://...`) directly:** Gmail/Outlook/Apple
Mail cannot open a custom URL scheme from a desktop client, and a real user's phone cannot
resolve an Expo Go dev-only `exp://<lan-ip>:8081/--/...` link — so a plain HTTPS page is the only
link shape that reliably opens from every mail client on every device. `apps/mobile`'s
`verify-email.tsx`/`reset-password.tsx` screens still exist and still work for local Expo Go
deep-link testing; they're just no longer what the emailed link points at. HTTPS deep linking
into the mobile app itself (Android App Links / iOS Universal Links) is prepared for but not
wired up yet — see "Mobile deep linking" in `apps/web/README.md` for exactly what's missing and
why (it needs a real deployed domain, which doesn't exist in this repository's environment).

Email sending goes through one of two `EmailService` implementations, selected by the
`EMAIL_PROVIDER` env var — no provider-specific code in routes or `authService.ts`:

- `maildev` (default, local development) — SMTP via `SmtpEmailService`, targeting the local
  MailDev catcher (`docker-compose.yml`, no auth, port 1025, web UI at `:1080`). Nothing is ever
  really delivered.
- `resend` (staging/production) — `ResendEmailService`, Resend's HTTP API. Requires
  `RESEND_API_KEY` and a sending domain in `EMAIL_FROM` that's been verified in the Resend
  dashboard (see `apps/web/README.md`). `apps/api/src/env.ts` refuses to start with
  `NODE_ENV=production` unless `EMAIL_PROVIDER=resend` — production can never silently fall back
  to MailDev.

Sending is fire-and-forget inside the service either way: a transient delivery failure is
logged, never allowed to fail the request that already completed its account-affecting write.
Email content carries only the action link — no tokens beyond it, no account secrets, no logging
of links, tokens, or the Resend API key. Amazon SES is deliberately not used — Resend was chosen
instead so transactional email needs no AWS infrastructure of its own.

## Email normalization

One strategy everywhere: `emailSchema` in `packages/validation/src/common.ts` trims and
lowercases, and the `users.email` unique constraint is on the normalized value. Registration,
login, forgot-password, and resend-verification all normalize through the same schema, so
`User@Example.com` and `user@example.com` can never become two accounts and any casing logs in.
No provider-specific normalization (Gmail dot/plus-tag folding) — that would be speculative.

## Social sign-in

**Placeholder only in Phase 1.** The mobile login/register screens render "Continue with
Google" and "Continue with Apple" buttons in the design system, disabled with a "Coming soon"
label (`apps/mobile/src/components/social-sign-in.tsx`). They cannot authenticate, cannot
create users, and no OAuth credentials or backend token verification exist. The eventual
design (recorded here for the phase that implements it): the client obtains an ID token from
the provider; the backend verifies it against the provider's public keys, resolves or creates
the user record, and issues Social Cup's own access/refresh tokens. Apple only sends name/email
on the first authorization, so those must be persisted on first sign-in. Both providers resolve
to the same internal user record type as email/password — authorization downstream never
branches on the sign-in method.

## Authorization model

`requireAuth()` middleware (`apps/api/src/middleware/requireAuth.ts`) verifies the Bearer
access token locally (no per-request database round trip, per ADR-0004) and attaches the
identity to `req.auth`. Role/state checks (Visitor vs. Member) are enforced in middleware
reading claims off the verified token or via `domain/entitlements.ts` —
`getAccountState()` is the single seam between authentication and membership entitlement; it
currently resolves every account to `visitor` and is the exact place the Phase 4 membership
module plugs in a real subscription-state query. `requireMembership()` gates Member-only
routes and is ready but unused in Phase 1 (no Member-gated route exists yet — redemption is
Phase 4+). Client-rendered UI based on account state is a UX convenience, not a security
boundary; every state-gated action is re-checked server-side.

Barista access is a separate model entirely — a per-cafe PIN establishes device trust, not a
user login (see [docs/architecture/redemption.md](redemption.md)). It does not use the
access/refresh token scheme above. **Implemented (Phase 5):** this is also where the
httpOnly-cookie storage design noted above for a future web auth surface was actually first put to
use — `apps/api/src/lib/baristaCookie.ts` sets an httpOnly, `Secure` (outside local dev),
`SameSite=Strict` cookie scoped to `/api/v1/barista`, holding an opaque token hashed the same way
as a refresh token, never the PIN itself and never in `localStorage`.

## What's explicitly deferred

- Multi-factor authentication — not in the PRD for Phase 1.
- Google/Apple sign-in — placeholder buttons only (above).
- RS256/JWKS-based access tokens — HS256 is sufficient while `apps/api` is the only verifier.
- Session/device management UI ("log out of all devices") beyond what refresh-token-chain
  revocation already gives the backend for free.
- In-app password change and account deletion — not in Phase 1 scope (account deletion must
  cancel a Stripe subscription, so it lands with Phase 4).
