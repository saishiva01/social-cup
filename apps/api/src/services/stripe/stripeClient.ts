import Stripe from 'stripe';

/**
 * The one place `new Stripe(...)` is called. Deliberately does not pass
 * `apiVersion` — omitting it makes the SDK use the version pinned to the
 * installed `stripe` package itself (the recommended default, matching this
 * package's own TypeScript types), rather than the Stripe account's
 * dashboard-configured default. See stripeService.ts for why the mobile
 * PaymentSheet's ephemeral key needs a separately, explicitly pinned version.
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}
