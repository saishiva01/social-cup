import type { Express } from 'express';
import request from 'supertest';
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractTokenFromUrl,
  setupTestDatabase,
  TEST_DATABASE_URL,
  truncateAll,
} from './helpers/db.js';
import { makeTestApp, RecordingEmailService } from './helpers/app.js';
import {
  createFakeStripeService,
  signStripeEventPayload,
  type FakeStripeService,
} from './helpers/fakeStripeService.js';

const skip = !TEST_DATABASE_URL;

const WEBHOOK_SECRET = 'whsec_test_membership_suite';

vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
vi.stubEnv('STRIPE_PRICE_ID', 'price_test_the_one_plan');

describe.skipIf(skip)('membership and credits (real Postgres)', () => {
  let client: Awaited<ReturnType<typeof setupTestDatabase>>['client'];
  let db: Awaited<ReturnType<typeof setupTestDatabase>>['db'];
  let close: Awaited<ReturnType<typeof setupTestDatabase>>['close'];
  let emails: RecordingEmailService;
  let stripe: FakeStripeService;

  beforeAll(async () => {
    ({ client, db, close } = await setupTestDatabase(TEST_DATABASE_URL!));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(client);
    emails = new RecordingEmailService();
    stripe = createFakeStripeService(WEBHOOK_SECRET);
  });

  /** Every call shares the same in-memory fake Stripe state — required for a fake with counters/maps, unlike the stateless real services other suites use `app()` with. */
  async function app(): Promise<Express> {
    return makeTestApp(client, emails, stripe);
  }

  async function authenticatedUser(email: string): Promise<{ accessToken: string }> {
    const registerBody = { email, password: 'correct-horse', displayName: 'Ada Lovelace' };
    await request(await app())
      .post('/api/v1/auth/register')
      .send(registerBody)
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const match = latest.text.match(/https?:\/\/\S+|socialcup:\/\/\S+/);
    const token = extractTokenFromUrl(match ? match[0] : '');
    await request(await app())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);
    const login = await request(await app())
      .post('/api/v1/auth/login')
      .send({ email, password: registerBody.password });
    return { accessToken: login.body.data.tokens.accessToken as string };
  }

  function authHeader(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  async function sendWebhook(eventBody: Record<string, unknown>) {
    const { payload, signature } = signStripeEventPayload(eventBody, WEBHOOK_SECRET);
    return request(await app())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
  }

  function subscriptionEvent(opts: {
    id?: string;
    type: string;
    subscriptionId: string;
    customerId: string;
    status: string;
    cancelAtPeriodEnd?: boolean;
    periodStart: number;
    periodEnd: number;
  }) {
    return {
      id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: opts.type,
      data: {
        object: {
          id: opts.subscriptionId,
          object: 'subscription',
          customer: opts.customerId,
          status: opts.status,
          cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
          items: {
            object: 'list',
            data: [{ current_period_start: opts.periodStart, current_period_end: opts.periodEnd }],
          },
        },
      },
    };
  }

  function invoicePaidEvent(opts: {
    id?: string;
    invoiceId: string;
    customerId: string;
    periodStart: number;
    periodEnd: number;
    billingReason?: string;
  }) {
    return {
      id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: opts.invoiceId,
          object: 'invoice',
          customer: opts.customerId,
          billing_reason: opts.billingReason ?? 'subscription_create',
          lines: {
            object: 'list',
            data: [{ period: { start: opts.periodStart, end: opts.periodEnd } }],
          },
        },
      },
    };
  }

  function invoicePaymentFailedEvent(opts: { id?: string; invoiceId: string; customerId: string }) {
    return {
      id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: { id: opts.invoiceId, object: 'invoice', customer: opts.customerId },
      },
    };
  }

  describe('GET /membership', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await request(await app()).get('/api/v1/membership');
      expect(res.status).toBe(401);
    });

    it('reports a fresh Visitor as not a member with zero credits', async () => {
      const { accessToken } = await authenticatedUser('visitor@example.com');
      const res = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        isMember: false,
        status: 'incomplete',
        credits: 0,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    });
  });

  describe('POST /membership/subscribe', () => {
    it('creates a Stripe customer and returns PaymentSheet-safe fields', async () => {
      const { accessToken } = await authenticatedUser('subscriber@example.com');

      const res = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        paymentIntentClientSecret: expect.stringContaining('secret'),
        ephemeralKeySecret: expect.stringContaining('ek_fake_'),
        customerId: expect.stringContaining('cus_fake_'),
        subscriptionId: expect.stringContaining('sub_fake_'),
      });
      // Never leaks the Stripe secret key or webhook secret.
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('sk_test');
      expect(body).not.toContain(WEBHOOK_SECRET);

      expect(stripe.createdCustomers).toHaveLength(1);
    });

    it('never lets the client choose the price — the server-configured price id is always used, request body is ignored', async () => {
      const { accessToken } = await authenticatedUser('price@example.com');

      await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({ priceId: 'price_evil_dollar', amount: 1 })
        .expect(200);

      expect(stripe.createSubscriptionCalls).toHaveLength(1);
      expect(stripe.createSubscriptionCalls[0]!.priceId).toBe('price_test_the_one_plan');
    });

    it('does not create a duplicate Stripe customer or subscription on a repeated call', async () => {
      const { accessToken } = await authenticatedUser('retry@example.com');

      const first = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const second = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(stripe.createdCustomers).toHaveLength(1);
      expect(stripe.createSubscriptionCalls).toHaveLength(1);
      expect(second.body.data.customerId).toBe(first.body.data.customerId);
      expect(second.body.data.subscriptionId).toBe(first.body.data.subscriptionId);
    });

    it('rejects subscribing again once already an active member', async () => {
      const { accessToken } = await authenticatedUser('already-member@example.com');

      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);
      await sendWebhook(
        invoicePaidEvent({
          invoiceId: 'in_active_guard',
          customerId,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );

      const res = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Stripe webhook signature verification', () => {
    it('rejects an invalid signature', async () => {
      const res = await request(await app())
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', 't=1,v1=not-a-real-signature')
        .send(JSON.stringify({ id: 'evt_bad', type: 'invoice.paid', data: { object: {} } }));

      expect(res.status).toBe(400);
    });

    it('rejects a request with no signature header at all', async () => {
      const res = await request(await app())
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ id: 'evt_no_sig', type: 'invoice.paid', data: { object: {} } }));

      expect(res.status).toBe(400);
    });

    it('accepts a validly signed event', async () => {
      const { accessToken } = await authenticatedUser('sig-ok@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);

      const res = await sendWebhook(
        invoicePaidEvent({
          invoiceId: 'in_sig_ok',
          customerId,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('invoice.paid → credit grant (exactly 30, exactly once)', () => {
    it('grants exactly 30 credits and activates membership on a successful payment', async () => {
      const { accessToken } = await authenticatedUser('paid@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);
      const periodEnd = now + 2592000;

      const webhookRes = await sendWebhook(
        invoicePaidEvent({ invoiceId: 'in_success_1', customerId, periodStart: now, periodEnd }),
      );
      expect(webhookRes.status).toBe(200);

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.isMember).toBe(true);
      expect(statusRes.body.data.status).toBe('active');
      expect(statusRes.body.data.credits).toBe(30);
      expect(statusRes.body.data.currentPeriodEnd).toBe(new Date(periodEnd * 1000).toISOString());
    });

    it('does not grant credits twice when the same webhook event is redelivered', async () => {
      const { accessToken } = await authenticatedUser('duplicate@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);
      const event = invoicePaidEvent({
        id: 'evt_fixed_duplicate_test',
        invoiceId: 'in_duplicate_1',
        customerId,
        periodStart: now,
        periodEnd: now + 2592000,
      });

      const first = await sendWebhook(event);
      const second = await sendWebhook(event); // Stripe redelivering the exact same event id

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.credits).toBe(30);
    });

    it('does not grant credits twice even if the invoice id repeats under a different event id', async () => {
      const { accessToken } = await authenticatedUser('same-invoice@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);

      await sendWebhook(
        invoicePaidEvent({
          id: 'evt_a',
          invoiceId: 'in_shared',
          customerId,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );
      await sendWebhook(
        invoicePaidEvent({
          id: 'evt_b',
          invoiceId: 'in_shared',
          customerId,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.credits).toBe(30);
    });

    it('rolls back every change from a failed webhook transaction — including the idempotency claim — so an identical retry can still fully succeed', async () => {
      const { accessToken } = await authenticatedUser('transient-failure@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);
      const event = invoicePaidEvent({
        id: 'evt_transient_failure',
        invoiceId: 'in_transient_failure',
        customerId,
        periodStart: now,
        periodEnd: now + 2592000,
      }) as unknown as Stripe.Event;

      // Directly exercises stripeWebhookService (not the HTTP route) so a
      // real, otherwise-unmodified transaction can be forced to fail AFTER
      // doing its real work (claim insert + membership update + ledger
      // insert) — proving the whole thing rolls back together, not just
      // that a pre-write validation rejected it.
      let attempt = 0;
      const flakyDb: typeof db = {
        ...db,
        transaction: (fn) => {
          attempt += 1;
          if (attempt === 1) {
            return db.transaction(async (tx) => {
              await fn(tx);
              throw new Error('simulated transient failure after real work ran');
            }) as ReturnType<typeof db.transaction>;
          }
          return db.transaction(fn);
        },
      } as typeof db;
      const { createStripeWebhookService } = await import('../services/stripeWebhookService.js');
      const flakyWebhookService = createStripeWebhookService({ db: flakyDb });

      await expect(flakyWebhookService.processEvent(event)).rejects.toThrow(
        'simulated transient failure',
      );

      const afterFailure = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(afterFailure.body.data.credits).toBe(0);
      expect(afterFailure.body.data.isMember).toBe(false);

      // Retry: the identical event, now through the real (non-flaky) service.
      await createStripeWebhookService({ db }).processEvent(event);

      const afterRetry = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(afterRetry.body.data.credits).toBe(30);
      expect(afterRetry.body.data.isMember).toBe(true);
    });
  });

  describe('invoice.payment_failed', () => {
    it('marks the membership past_due and grants no credits', async () => {
      const { accessToken } = await authenticatedUser('failed@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };

      const res = await sendWebhook(
        invoicePaymentFailedEvent({ invoiceId: 'in_failed_1', customerId }),
      );
      expect(res.status).toBe(200);

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.isMember).toBe(false);
      expect(statusRes.body.data.status).toBe('past_due');
      expect(statusRes.body.data.credits).toBe(0);
    });
  });

  describe('subscription lifecycle events', () => {
    it('reflects cancellation via customer.subscription.deleted', async () => {
      const { accessToken } = await authenticatedUser('cancel@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId, subscriptionId } = subscribeRes.body.data as {
        customerId: string;
        subscriptionId: string;
      };
      const now = Math.floor(Date.now() / 1000);
      await sendWebhook(
        invoicePaidEvent({
          invoiceId: 'in_before_cancel',
          customerId,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );

      await sendWebhook(
        subscriptionEvent({
          type: 'customer.subscription.deleted',
          subscriptionId,
          customerId,
          status: 'canceled',
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.status).toBe('canceled');
      expect(statusRes.body.data.isMember).toBe(false);
      // Credits already granted this cycle are not clawed back by cancellation.
      expect(statusRes.body.data.credits).toBe(30);
    });

    it('reflects a cancel-at-period-end flag via customer.subscription.updated without deactivating early', async () => {
      const { accessToken } = await authenticatedUser('cancel-at-end@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId, subscriptionId } = subscribeRes.body.data as {
        customerId: string;
        subscriptionId: string;
      };
      const now = Math.floor(Date.now() / 1000);
      const periodEnd = now + 2592000;
      await sendWebhook(
        invoicePaidEvent({ invoiceId: 'in_before_flag', customerId, periodStart: now, periodEnd }),
      );

      await sendWebhook(
        subscriptionEvent({
          type: 'customer.subscription.updated',
          subscriptionId,
          customerId,
          status: 'active',
          cancelAtPeriodEnd: true,
          periodStart: now,
          periodEnd,
        }),
      );

      const statusRes = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(accessToken));
      expect(statusRes.body.data.status).toBe('active');
      expect(statusRes.body.data.isMember).toBe(true);
      expect(statusRes.body.data.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('ownership', () => {
    it('never mixes one user’s membership/credits into another’s status response', async () => {
      const userA = await authenticatedUser('owner-a@example.com');
      const userB = await authenticatedUser('owner-b@example.com');

      const subscribeA = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(userA.accessToken))
        .send({});
      const { customerId: customerA } = subscribeA.body.data as { customerId: string };
      const now = Math.floor(Date.now() / 1000);
      await sendWebhook(
        invoicePaidEvent({
          invoiceId: 'in_owner_a',
          customerId: customerA,
          periodStart: now,
          periodEnd: now + 2592000,
        }),
      );

      const statusA = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(userA.accessToken));
      const statusB = await request(await app())
        .get('/api/v1/membership')
        .set(...authHeader(userB.accessToken));

      expect(statusA.body.data.isMember).toBe(true);
      expect(statusA.body.data.credits).toBe(30);
      expect(statusB.body.data.isMember).toBe(false);
      expect(statusB.body.data.credits).toBe(0);
    });
  });

  describe('POST /membership/billing-portal', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await request(await app()).post('/api/v1/membership/billing-portal');
      expect(res.status).toBe(401);
    });

    it('rejects a Visitor who has never subscribed (no Stripe customer to manage)', async () => {
      const { accessToken } = await authenticatedUser('no-customer@example.com');
      const res = await request(await app())
        .post('/api/v1/membership/billing-portal')
        .set(...authHeader(accessToken))
        .send({});
      expect(res.status).toBe(409);
    });

    it('returns a portal session scoped to the authenticated user’s own Stripe customer', async () => {
      const { accessToken } = await authenticatedUser('portal@example.com');
      const subscribeRes = await request(await app())
        .post('/api/v1/membership/subscribe')
        .set(...authHeader(accessToken))
        .send({});
      const { customerId } = subscribeRes.body.data as { customerId: string };

      const res = await request(await app())
        .post('/api/v1/membership/billing-portal')
        .set(...authHeader(accessToken))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.url).toContain(customerId);
    });
  });
});
