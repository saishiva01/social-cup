import type Stripe from 'stripe';

import { subscriptionPeriod } from './stripeMappers.js';

export interface StripeSubscriptionResult {
  id: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Null once the subscription's first invoice has already been paid (nothing left to confirm client-side). */
  latestInvoicePaymentIntentClientSecret: string | null;
}

/**
 * Every Stripe SDK call the API makes, behind one interface — see CLAUDE.md's
 * suggested `stripe/` module layout. Route handlers and membershipService
 * never import the `stripe` package directly; this is the only seam that
 * does, which is also what makes it possible to inject a deterministic fake
 * in tests (docs/development/testing-strategy.md: real Stripe network calls
 * never run in the automated suite).
 */
export interface StripeService {
  createCustomer(params: { email: string; name: string; userId: string }): Promise<{ id: string }>;
  createEphemeralKey(customerId: string): Promise<{ secret: string }>;
  createSubscription(params: {
    customerId: string;
    priceId: string;
    userId: string;
  }): Promise<StripeSubscriptionResult>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionResult>;
  createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  /** Verifies the Stripe-Signature header and parses the raw body — throws on an invalid/missing signature. */
  constructEvent(payload: Buffer, signature: string): Stripe.Event;
}

export function createStripeService(deps: {
  stripe: Stripe;
  webhookSecret: string;
  apiVersion: string;
}): StripeService {
  const { stripe, webhookSecret, apiVersion } = deps;

  function toResult(subscription: Stripe.Subscription): StripeSubscriptionResult {
    const { currentPeriodStart, currentPeriodEnd } = subscriptionPeriod(subscription);
    const latestInvoice =
      typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null;

    return {
      id: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart,
      currentPeriodEnd,
      latestInvoicePaymentIntentClientSecret:
        latestInvoice?.confirmation_secret?.client_secret ?? null,
    };
  }

  return {
    async createCustomer({ email, name, userId }) {
      const customer = await stripe.customers.create({ email, name, metadata: { userId } });
      return { id: customer.id };
    },

    async createEphemeralKey(customerId) {
      // apiVersion here is intentionally the mobile-SDK-facing version, which
      // can differ from this server's own pinned library version — see
      // stripeClient.ts and docs/architecture/payments.md.
      const key = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion });
      if (!key.secret) throw new Error('Stripe did not return an ephemeral key secret');
      return { secret: key.secret };
    },

    async createSubscription({ customerId, priceId, userId }) {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice'],
        metadata: { userId },
      });
      return toResult(subscription);
    },

    async retrieveSubscription(subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice'],
      });
      return toResult(subscription);
    },

    async createBillingPortalSession({ customerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },

    constructEvent(payload, signature) {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    },
  };
}
