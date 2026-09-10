# @social-cup/web

Social Cup's public web app. React + Vite + TypeScript + React Router. This is **not** the admin
panel or the barista scan page — it is the small, unauthenticated surface that receives the
HTTPS links sent in identity emails, because a mobile deep link (`exp://…`, `socialcup://…`)
cannot be opened directly from Gmail/Outlook/Apple Mail on desktop, and Expo Go's dev-only
`exp://<lan-ip>:8081/--/...` links are not something a real user's device can resolve.

## Status

Two routes only, matching current Phase 1 Module 2 scope:

- `/verify-email?token=...` — completes email verification (`POST /api/v1/auth/verify-email`).
- `/reset-password?token=...` — completes a password reset (`POST /api/v1/auth/reset-password`).

Both call the existing `apps/api` endpoints directly — no new backend logic, no new token
model. See [docs/architecture/authentication.md](../../docs/architecture/authentication.md).

## Running locally

```
cp apps/web/.env.example apps/web/.env
pnpm --filter @social-cup/web dev
```

Runs on http://localhost:5175. `apps/api/.env`'s `APP_WEB_URL` defaults to this address, and
`CORS_ALLOWED_ORIGINS` in `apps/api/.env.example` already includes it.

## Testing the full flow locally (MailDev)

1. `pnpm infra:up` (starts Postgres + MailDev), `pnpm --filter @social-cup/api dev`,
   `pnpm --filter @social-cup/web dev`.
2. Leave `apps/api/.env`'s `EMAIL_PROVIDER=maildev` (the default).
3. Register an account from the mobile app (Expo Go is fine for this part — only the emailed
   link needs to be HTTPS, not the app itself).
4. Open http://localhost:1080 (MailDev's web UI) and open the verification email. The link is a
   normal `http://localhost:5175/verify-email?token=...` URL — click it (or open it in any
   browser on the same machine).
5. Same pattern for password reset via the "Forgot password?" screen.

MailDev never delivers anywhere real — this is for local development/testing only.

## Resend setup (staging/production)

Set in `apps/api/.env` (or the deployed environment's secrets):

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=<from https://resend.com/api-keys>
EMAIL_FROM=Social Cup <no-reply@yourdomain.com>
APP_WEB_URL=https://<this app's deployed domain>
```

Requirements Resend enforces that are easy to miss:

- **The sending domain in `EMAIL_FROM` must be added and verified in the Resend dashboard**
  (SPF/DKIM DNS records) before any send succeeds — Resend rejects sends from an unverified
  domain. This is a one-time setup step per environment/domain, done in the Resend dashboard,
  not in this codebase.
- Resend's free tier restricts sending to the account owner's own verified email address until a
  domain is verified — don't assume delivery to arbitrary recipients works until that's done.
- `apps/api/src/env.ts` refuses to start with `NODE_ENV=production` unless
  `EMAIL_PROVIDER=resend`, so production can never silently fall back to MailDev.

## Deployment (not yet done)

This app is not yet wired into `infrastructure/` (no Terraform/S3/CloudFront resources exist for
it yet — see [docs/architecture/infrastructure.md](../../docs/architecture/infrastructure.md)).
Deploying it and pointing a real domain (e.g. `https://socialcup.app`) at it, then setting
`APP_WEB_URL` to that domain, is a remaining infrastructure step outside this change's scope.

### Mobile HTTPS deep linking (Android App Links / iOS Universal Links)

Once this app is deployed to a real domain, the mobile app can be configured to open natively
instead of falling through to the browser, by:

1. Hosting `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` at that
   domain (Apple/Google require these to be served from the exact production domain — they
   cannot be faked or hosted elsewhere).
2. Adding `ios.associatedDomains` (`applinks:<domain>`) and `android.intentFilters` to
   `apps/mobile/app.json`, and rebuilding the app (Expo Go cannot register OS-level App
   Links/Universal Links — this only takes effect in a real development or production build).

Neither is done yet because both require a real deployed domain, which doesn't exist in this
repository's current environment. Until then, `/verify-email` and `/reset-password` work
correctly as plain web pages — a user who taps the email link on their phone lands on this app in
their browser and completes the flow there, which is fully functional on its own.
