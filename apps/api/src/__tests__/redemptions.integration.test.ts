import { schema } from '@social-cup/database';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestDatabase, TEST_DATABASE_URL, truncateAll } from './helpers/db.js';
import { makeTestApp, RecordingEmailService } from './helpers/app.js';

const skip = !TEST_DATABASE_URL;

vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
vi.stubEnv('STRIPE_PRICE_ID', 'price_test_fake');

/**
 * Member-facing redemption creation/polling (PRD Module 8). Deliberately
 * does NOT drive membership state through real Stripe webhooks (already
 * covered end-to-end by membership.integration.test.ts) — grantMembership
 * below inserts the membership/ledger rows directly, per
 * docs/development/testing-strategy.md's "assume membership/credit state
 * can be created through existing test fixtures" for Phase 5 work. The
 * barista scan/atomic-deduction path (the safety-critical half of this
 * module) is covered separately in barista.integration.test.ts.
 */
describe.skipIf(skip)('redemption creation (real Postgres)', () => {
  let client: Awaited<ReturnType<typeof setupTestDatabase>>['client'];
  let db: Awaited<ReturnType<typeof setupTestDatabase>>['db'];
  let close: Awaited<ReturnType<typeof setupTestDatabase>>['close'];
  let emails: RecordingEmailService;

  beforeAll(async () => {
    ({ client, db, close } = await setupTestDatabase(TEST_DATABASE_URL!));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(client);
    emails = new RecordingEmailService();
  });

  async function app(): Promise<Express> {
    return makeTestApp(client, emails);
  }

  let userCounter = 0;
  async function registeredUser(): Promise<{
    accessToken: string;
    userId: string;
    testApp: Express;
  }> {
    userCounter += 1;
    const email = `user${userCounter}@example.com`;
    const testApp = await app();
    await request(testApp)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: `User ${userCounter}` })
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const match = latest.text.match(/https?:\/\/\S+|socialcup:\/\/\S+/);
    const token = match ? match[0].split('token=')[1]! : '';
    await request(testApp).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    const login = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct-horse' });
    return {
      accessToken: login.body.data.tokens.accessToken as string,
      userId: login.body.data.user.id as string,
      testApp,
    };
  }

  function authHeader(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  async function grantMembership(userId: string, credits = 30): Promise<{ periodEnd: Date }> {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(schema.memberships).values({
      userId,
      stripeCustomerId: `cus_test_${userId}`,
      stripeSubscriptionId: `sub_test_${userId}`,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
    if (credits !== 0) {
      await db.insert(schema.creditLedgerEntries).values({
        userId,
        amount: credits,
        reason: 'monthly_grant',
        periodStart,
        periodEnd,
      });
    }
    return { periodEnd };
  }

  async function seedCafe(fields: Partial<typeof schema.cafes.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.cafes)
      .values({
        name: 'Blackwood Roasting Co.',
        neighborhood: 'Bishop Arts District',
        address: '408 N Bishop Ave, Dallas, TX',
        latitude: '32.7477',
        longitude: '-96.8288',
        photos: [],
        vibeTags: [],
        hours: {},
        ...fields,
      })
      .returning();
    return row!.id;
  }

  async function seedDrink(
    cafeId: string,
    fields: Partial<typeof schema.drinks.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await db
      .insert(schema.drinks)
      .values({
        cafeId,
        name: 'Oat Milk Latte',
        retailPriceCents: 500,
        creditPrice: 5,
        isActive: true,
        ...fields,
      })
      .returning();
    return row!.id;
  }

  async function seedBaristaCredentials(
    cafeId: string,
    payoutRateCents: number | null = 70,
  ): Promise<void> {
    await db.insert(schema.cafeBaristaCredentials).values({
      cafeId,
      pinHash: 'unused-in-these-tests',
      payoutRateCents,
    });
  }

  describe('authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      const res = await request(await app())
        .post('/api/v1/redemptions')
        .send({ cafeId, drinkId });
      expect(res.status).toBe(401);
    });

    it('rejects a Visitor (authenticated, never subscribed)', async () => {
      const { accessToken, testApp } = await registeredUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      await seedBaristaCredentials(cafeId);

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(res.status).toBe(403);
    });

    it('allows an active Member with sufficient credits', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });
      await seedBaristaCredentials(cafeId);

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        cafeId,
        drinkId,
        creditCost: 5,
        code: expect.stringMatching(/^[0-9A-Z-]+$/),
        backupCode: expect.stringMatching(/^\d{6}$/),
      });
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('creation validation', () => {
    it('rejects a drink that does not belong to the given cafe', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeA = await seedCafe({ name: 'Cafe A' });
      const cafeB = await seedCafe({ name: 'Cafe B' });
      await seedBaristaCredentials(cafeA);
      const drinkAtB = await seedDrink(cafeB);

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId: cafeA, drinkId: drinkAtB });

      expect(res.status).toBe(404);
    });

    it('rejects an inactive drink', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId);
      const drinkId = await seedDrink(cafeId, { isActive: false });

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(res.status).toBe(404);
    });

    it('rejects a cafe with no payout rate configured (not yet redemption-eligible)', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      // No seedBaristaCredentials() call at all — cafe never onboarded.

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(res.status).toBe(409);
    });

    it('rejects insufficient credits', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 2);
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId);
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(res.status).toBe(409);
    });

    it('never lets the client choose the credit cost — the server-side drink price is always used', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId);
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });

      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        // Attempts to smuggle a cheaper price and a client-chosen expiry/status.
        .send({
          cafeId,
          drinkId,
          creditCost: 1,
          creditPrice: 1,
          expiresAt: '2099-01-01',
          status: 'redeemed',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.creditCost).toBe(5);
    });

    it('rejects malformed ids', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const res = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId: 'not-a-uuid', drinkId: 'also-not-a-uuid' });
      expect(res.status).toBe(400);
    });
  });

  describe('one live code at a time', () => {
    it('canceling a prior pending code when a new one is generated', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await grantMembership(userId, 30);
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId);
      const drinkId = await seedDrink(cafeId, { creditPrice: 3 });

      const first = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });
      const second = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).not.toBe(first.body.data.id);

      const [firstRow] = await db
        .select({ status: schema.redemptionCodes.status })
        .from(schema.redemptionCodes)
        .where(eq(schema.redemptionCodes.id, first.body.data.id));
      expect(firstRow?.status).toBe('canceled');
    });
  });

  describe('GET /redemptions/:id', () => {
    it('reports pending status for a fresh code and rejects a non-owner', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      const other = await registeredUser();
      await grantMembership(userId, 30);
      await grantMembership(other.userId, 30);
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId);
      const drinkId = await seedDrink(cafeId, { creditPrice: 3 });

      const created = await request(testApp)
        .post('/api/v1/redemptions')
        .set(...authHeader(accessToken))
        .send({ cafeId, drinkId });

      const own = await request(testApp)
        .get(`/api/v1/redemptions/${created.body.data.id}`)
        .set(...authHeader(accessToken));
      expect(own.status).toBe(200);
      expect(own.body.data.status).toBe('pending');

      const notOwner = await request(testApp)
        .get(`/api/v1/redemptions/${created.body.data.id}`)
        .set(...authHeader(other.accessToken));
      expect(notOwner.status).toBe(404);
    });
  });
});
