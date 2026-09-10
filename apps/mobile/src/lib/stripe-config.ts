/**
 * Inlined at build time by Expo — never put a secret behind EXPO_PUBLIC_.
 * The publishable key is not a secret (it can only identify the Stripe
 * account, never move money on its own) — see apps/mobile/.env.example.
 */
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_MERCHANT_COUNTRY_CODE =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE ?? 'US';
