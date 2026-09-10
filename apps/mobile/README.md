# @social-cup/mobile

Social Cup member mobile app. Expo + Expo Router + TypeScript, one codebase for iPhone and
Android.

## Status

Onboarding (Module 2), cafe discovery (Modules 3/4/6), ratings/diary (Module 5), and membership
(Module 7 — Stripe PaymentSheet, membership status, billing portal) are implemented. Redemption
(Module 8) is not — the cafe detail screen's Redeem button sends a Visitor to `/membership` and
stays presentation-only for a Member (no drink picker, no code, no barista flow). See
[docs/development/phases.md](../../docs/development/phases.md).

## Running locally

```
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @social-cup/mobile dev
```

Then press `i` (iOS simulator), `a` (Android emulator), or `w` (web) in the Expo CLI, or scan
the QR code with Expo Go.

### Physical device (Expo Go)

The default `EXPO_PUBLIC_API_URL=http://localhost:3000` only works from the iOS Simulator —
`localhost` on a physical phone resolves to the phone itself, not your dev machine. For a real
device on the same Wi-Fi/LAN as your dev machine:

1. Start the API (`apps/api` — see its README) and confirm the port it actually logs on
   startup (`PORT` in `apps/api/.env`, default `3000`).
2. Find your dev machine's LAN IP (`ipconfig` on Windows, look for the Wi-Fi/Ethernet adapter's
   IPv4 address).
3. Set `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:<API-port>`, then restart
   Expo (env vars are inlined at bundle time, so a running dev server won't pick up a `.env`
   change until it's restarted).
4. If the phone still can't connect, the API process itself is very likely reachable on the
   LAN already (Express/Node listens on all interfaces by default here) — the remaining usual
   suspect is a Windows Firewall inbound rule blocking the port, or the phone being on a
   different/guest Wi-Fi network that isolates clients from each other. Both are host/network
   configuration, not something to work around in application code.

## Layout

```
app.json            Expo config (name, bundle id / package name, icons, plugins)
src/
  app/               Expo Router routes (file-based) — _layout.tsx is the root layout
  components/        Shared UI primitives (ThemedText, ThemedView, ExternalLink)
  constants/theme.ts Color palette, spacing, fonts (light/dark)
  hooks/             use-color-scheme, use-theme
```

## Notes

- Only environment variables prefixed `EXPO_PUBLIC_` are readable in the app bundle. Never put
  a secret behind that prefix.
- `ios.bundleIdentifier` / `android.package` / the Apple Pay merchant identifier in `app.json`
  are currently placeholders (`com.socialcup.app` / `merchant.com.socialcup.app`) — confirm the
  real values before the first App Store Connect / Play Console setup and before Apple Pay is
  expected to actually appear in PaymentSheet (see docs/decisions/open-questions.md #5).
- Sign-in with Google and Apple remain UI placeholders (no OAuth credentials yet).
- **`@stripe/stripe-react-native` requires a custom dev client, not Expo Go** — it's a native
  module. Run `pnpm --filter @social-cup/mobile exec expo run:ios` /
  `expo run:android` (or build with EAS) after installing dependencies; `expo start` alone will
  launch fine but the membership screen's PaymentSheet calls will fail inside plain Expo Go.
- Copy `apps/mobile/.env.example` → `.env` and fill in `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` from
  the same Stripe test-mode account as `apps/api`'s `STRIPE_SECRET_KEY` — a publishable key from a
  different account will fail every PaymentSheet call with an authentication error.
