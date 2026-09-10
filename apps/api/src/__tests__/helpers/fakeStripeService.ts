import Stripe from 'stripe';

import type {
  StripeService,
  StripeSubscriptionResult,
} from '../../services/stripe/StripeService.js';

/**
 * A deterministic in-memory double for every Stripe SDK call
 * membershipService/the webhook route makes — no network access, per
 * docs/development/testing-strategy.md ("prefer mocked Stripe service ...
 * for automated backend tests"). `constructEvent` is the one exception: it
 * delegates to the REAL `stripe` package's local, network-free signature
 * verification (`Stripe.webhooks.constructEvent`), so signature-verification
 * tests exercise the actual cryptographic check, not a stub of it. Tests
 * build their own Stripe.Event fixtures and sign them with
 * `signStripeEventPayload` below.
 */
export interface FakeStripeService extends StripeService {
  /** Every subscription created so far, keyed by id — lets a test simulate "later" states without a second createSubscription call. */
  subscriptions: Map<string, StripeSubscriptionResult>;
  /** Overrides what the next createSubscription/retrieveSubscription call returns, for simulating a specific lifecycle state. */
  setSubscriptionResult(id: string, result: Partial<StripeSubscriptionResult>): void;
  /** Every createCustomer call so far — asserting on this is how a test proves a Stripe customer was (or was not) created a second time. */
  createdCustomers: Array<{ email: string; name: string; userId: string }>;
  /** Every createSubscription call so far — asserting on `priceId` here is how a test proves the server, not the client, chose the price. */
  createSubscriptionCalls: Array<{ customerId: string; priceId: string; userId: string }>;
}

export function createFakeStripeService(webhookSecret: string): FakeStripeService {
  // Only used for local, offline signature verification (see module comment)
  // — never makes a network call, so a fake key is fine.
  const realStripeForSignatures = new Stripe('sk_test_fake_for_local_signature_checks_only');

  let customerCounter = 0;
  let subscriptionCounter = 0;
  const subscriptions = new Map<string, StripeSubscriptionResult>();
  const createdCustomers: FakeStripeService['createdCustomers'] = [];
  const createSubscriptionCalls: FakeStripeService['createSubscriptionCalls'] = [];

  function defaultSubscriptionResult(id: string): StripeSubscriptionResult {
    const now = Math.floor(Date.now() / 1000);
    return {
      id,
      status: 'incomplete',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(now * 1000),
      currentPeriodEnd: new Date((now + 30 * 24 * 60 * 60) * 1000),
      latestInvoicePaymentIntentClientSecret: `pi_fake_${id}_secret_test`,
    };
  }

  return {
    subscriptions,
    createdCustomers,
    createSubscriptionCalls,

    setSubscriptionResult(id, result) {
      const current = subscriptions.get(id) ?? defaultSubscriptionResult(id);
      subscriptions.set(id, { ...current, ...result });
    },

    async createCustomer({ email, name, userId }) {
      customerCounter += 1;
      createdCustomers.push({ email, name, userId });
      return { id: `cus_fake_${customerCounter}` };
    },

    async createEphemeralKey(customerId) {
      return { secret: `ek_fake_${customerId}_${Math.random().toString(36).slice(2)}` };
    },

    async createSubscription({ customerId, priceId, userId }) {
      subscriptionCounter += 1;
      const id = `sub_fake_${subscriptionCounter}`;
      createSubscriptionCalls.push({ customerId, priceId, userId });
      const result = defaultSubscriptionResult(id);
      subscriptions.set(id, result);
      return result;
    },

    async retrieveSubscription(subscriptionId) {
      const result = subscriptions.get(subscriptionId);
      if (!result) throw new Error(`Fake Stripe: unknown subscription ${subscriptionId}`);
      return result;
    },

    async createBillingPortalSession({ customerId }) {
      return { url: `https://billing.stripe.com/fake-session/${customerId}` };
    },

    constructEvent(payload, signature) {
      return realStripeForSignatures.webhooks.constructEvent(payload, signature, webhookSecret);
    },
  };
}

/** Signs a JSON-serializable Stripe event fixture the way Stripe itself would, for posting to the webhook route in tests. */
export function signStripeEventPayload(
  event: unknown,
  secret: string,
): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}
