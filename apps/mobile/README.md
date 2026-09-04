# @social-cup/mobile

Social Cup member mobile app. Expo + Expo Router + TypeScript, one codebase for iPhone and
Android.

## Status

Foundation only: Expo Router file-based routing shell, theming primitives (`ThemedText`,
`ThemedView`, light/dark color scheme), and a placeholder home screen. Onboarding, discovery,
ratings, membership/Stripe checkout, and redemption (PRD Modules 2–8) are built in a later
phase — see [docs/development/phases.md](../../docs/development/phases.md).

## Running locally

```
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @social-cup/mobile dev
```

Then press `i` (iOS simulator), `a` (Android emulator), or `w` (web) in the Expo CLI, or scan
the QR code with Expo Go.

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
- `ios.bundleIdentifier` / `android.package` in `app.json` are currently placeholders
  (`com.socialcup.app`) — confirm the real values before the first App Store Connect / Play
  Console setup (see docs/decisions/open-questions.md).
- Sign-in with Google and Apple, and the Stripe React Native SDK payment sheet, are introduced
  alongside the auth and membership phases — no native config for either exists yet.
