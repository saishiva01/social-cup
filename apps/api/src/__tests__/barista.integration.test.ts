import { schema } from '@social-cup/database';
import { and, eq } from 'drizzle-orm';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
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

// Low cost factor here only — this is fixture setup, not production PIN
// hashing (apps/api/src/lib/password.ts stays at cost 12 everywhere real).
const TEST_PIN_COST = 4;

/**
 * The safety-critical half of Phase 5 (PRD Module 8): barista PIN auth,
 * trusted-device cafe-scoping, and — most importantly — the atomic
 * scan/redeem transaction (ADR-0006) that must never double-deduct credits
 * or leave a code consumed without a matching ledger entry. See
 * docs/architecture/redemption.md and docs/development/testing-strategy.md
 * for why these concurrency assertions specifically are non-negotiable.
 */
describe.skipIf(skip)('barista authentication and redemption (real Postgres)', () => {
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
  async function registeredUser(
    testApp: Express,
  ): Promise<{ accessToken: string; userId: string }> {
    userCounter += 1;
    const email = `member${userCounter}@example.com`;
    await request(testApp)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: `Member ${userCounter} Smith` })
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
    };
  }

  function authHeader(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
  }

  async function grantMembership(userId: string, credits = 30): Promise<void> {
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
  }

  async function seedCafe(name = 'Blackwood Roasting Co.'): Promise<string> {
    const [row] = await db
      .insert(schema.cafes)
      .values({
        name,
        neighborhood: 'Bishop Arts District',
        address: '408 N Bishop Ave, Dallas, TX',
        latitude: '32.7477',
        longitude: '-96.8288',
        photos: [],
        vibeTags: [],
        hours: {},
      })
      .returning();
    return row!.id;
  }

  async function seedDrink(cafeId: string, creditPrice = 5): Promise<string> {
    const [row] = await db
      .insert(schema.drinks)
      .values({
        cafeId,
        name: 'Oat Milk Latte',
        retailPriceCents: 500,
        creditPrice,
        isActive: true,
      })
      .returning();
    return row!.id;
  }

  async function seedBaristaCredentials(
    cafeId: string,
    pin = '1234',
    payoutRateCents: number | null = 70,
  ): Promise<void> {
    const pinHash = await bcrypt.hash(pin, TEST_PIN_COST);
    await db.insert(schema.cafeBaristaCredentials).values({ cafeId, pinHash, payoutRateCents });
  }

  /** Only the redemption-reason ledger rows — grantMembership's monthly_grant row is a separate concern each test already knows about. */
  async function redemptionLedgerRows(userId: string) {
    return db
      .select()
      .from(schema.creditLedgerEntries)
      .where(
        and(
          eq(schema.creditLedgerEntries.userId, userId),
          eq(schema.creditLedgerEntries.reason, 'redemption'),
        ),
      );
  }

  /** Creates a member with credits, a pending redemption code, and returns both. */
  async function createPendingRedemption(
    testApp: Express,
    opts: { cafeId: string; creditPrice?: number; credits?: number } = { cafeId: '' },
  ) {
    const cafeId = opts.cafeId;
    const { accessToken, userId } = await registeredUser(testApp);
    await grantMembership(userId, opts.credits ?? 30);
    const drinkId = await seedDrink(cafeId, opts.creditPrice ?? 5);

    const created = await request(testApp)
      .post('/api/v1/redemptions')
      .set(...authHeader(accessToken))
      .send({ cafeId, drinkId })
      .expect(201);

    return {
      userId,
      code: created.body.data.code as string,
      backupCode: created.body.data.backupCode as string,
      drinkId,
    };
  }

  describe('PIN authentication', () => {
    it('rejects an unknown cafe', async () => {
      const res = await request(await app())
        .post('/api/v1/barista/authenticate')
        .send({ cafeId: '00000000-0000-0000-0000-000000000000', pin: '1234' });
      expect(res.status).toBe(404);
    });

    it('rejects the wrong PIN', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');

      const res = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '9999' });
      expect(res.status).toBe(401);
    });

    it('accepts the correct PIN and sets a trusted-device cookie, never in the response body', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');

      const res = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '1234' });
      expect(res.status).toBe(200);
      expect(res.body.data.cafeId).toBe(cafeId);
      expect(JSON.stringify(res.body)).not.toContain('1234');
      const setCookie = res.headers['set-cookie'];
      expect(setCookie?.[0]).toContain('HttpOnly');
      expect(setCookie?.[0]).toContain('sc_barista_device=');
    });

    it('rejects malformed PIN input', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const res = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: 'abcd' });
      expect(res.status).toBe(400);
    });
  });

  describe('cafe-bound trusted device', () => {
    it('rejects /redeem and /today with no cookie at all', async () => {
      const testApp = await app();
      const res = await request(testApp).post('/api/v1/barista/redeem').send({ code: 'whatever' });
      expect(res.status).toBe(401);
    });

    it("a device trusted for cafe A cannot redeem cafe B's code", async () => {
      const testApp = await app();
      const cafeA = await seedCafe('Cafe A');
      const cafeB = await seedCafe('Cafe B');
      await seedBaristaCredentials(cafeA, '1111');
      await seedBaristaCredentials(cafeB, '2222');

      const { code } = await createPendingRedemption(testApp, { cafeId: cafeB });

      const agentA = request.agent(testApp);
      await agentA
        .post('/api/v1/barista/authenticate')
        .send({ cafeId: cafeA, pin: '1111' })
        .expect(200);

      const res = await agentA.post('/api/v1/barista/redeem').send({ code });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/not valid at this cafe/i);
    });
  });

  describe('successful redemption', () => {
    it('deducts credits, records the redemption, and returns the green-screen payload', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234', 70);
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 5,
        credits: 30,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const res = await agent.post('/api/v1/barista/redeem').send({ code });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        memberFirstName: expect.any(String),
        drinkName: 'Oat Milk Latte',
        creditsDeducted: 5,
      });

      const ledgerRows = await redemptionLedgerRows(userId);
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0]!.amount).toBe(-5);
      expect(ledgerRows[0]!.reason).toBe('redemption');

      const redemptionRows = await db
        .select()
        .from(schema.redemptions)
        .where(eq(schema.redemptions.userId, userId));
      expect(redemptionRows).toHaveLength(1);
      expect(redemptionRows[0]!.payoutRateCents).toBe(70);
      expect(redemptionRows[0]!.creditAmount).toBe(5);
    });

    it('accepts the six-digit backup code identically', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { backupCode } = await createPendingRedemption(testApp, { cafeId, creditPrice: 3 });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const res = await agent.post('/api/v1/barista/redeem').send({ code: backupCode });
      expect(res.status).toBe(200);
    });

    it('is case/formatting-insensitive for the primary code', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { code } = await createPendingRedemption(testApp, { cafeId, creditPrice: 2 });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const messy = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
      const res = await agent.post('/api/v1/barista/redeem').send({ code: messy });
      expect(res.status).toBe(200);
    });
  });

  describe('single use / replay', () => {
    it('rejects redeeming the same code a second time, and does not deduct twice', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 4,
        credits: 30,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const first = await agent.post('/api/v1/barista/redeem').send({ code });
      const second = await agent.post('/api/v1/barista/redeem').send({ code });

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(second.body.error.message).toMatch(/already redeemed/i);

      expect(await redemptionLedgerRows(userId)).toHaveLength(1);
    });

    it('rejects the backup code once the primary code already redeemed it', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { code, backupCode } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 2,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);
      await agent.post('/api/v1/barista/redeem').send({ code }).expect(200);

      const res = await agent.post('/api/v1/barista/redeem').send({ code: backupCode });
      expect(res.status).toBe(409);
    });
  });

  describe('expiration', () => {
    it('rejects a code past its five-minute window and deducts nothing', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 3,
        credits: 30,
      });

      // Force expiry directly rather than waiting five real minutes.
      await db
        .update(schema.redemptionCodes)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.redemptionCodes.userId, userId));

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);
      const res = await agent.post('/api/v1/barista/redeem').send({ code });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/expired/i);

      expect(await redemptionLedgerRows(userId)).toHaveLength(0);
    });
  });

  describe('invalid input', () => {
    it('rejects an unknown code with a generic reason, not a leak of which part was wrong', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const res = await agent.post('/api/v1/barista/redeem').send({ code: 'TOTALLY-BOGUS' });
      expect(res.status).toBe(404);
      expect(res.body.error.message).toMatch(/invalid code/i);
    });
  });

  describe('insufficient credits at scan time', () => {
    it('rejects when the balance dropped between code creation and scan', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 5,
        credits: 5,
      });

      // Simulate a concurrent event draining the balance after the code was
      // generated but before the scan (e.g. a second, since-consumed code).
      await db.insert(schema.creditLedgerEntries).values({
        userId,
        amount: -5,
        reason: 'redemption',
        periodStart: new Date(Date.now() - 1000),
        periodEnd: (
          await db.select().from(schema.memberships).where(eq(schema.memberships.userId, userId))
        )[0]!.currentPeriodEnd!,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);
      const res = await agent.post('/api/v1/barista/redeem').send({ code });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/not enough credits/i);
    });
  });

  describe('concurrency: two simultaneous scans of the same code', () => {
    it('exactly one succeeds, exactly one ledger entry is created, balance never goes negative', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 5,
        credits: 5,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);

      const [resultA, resultB] = await Promise.all([
        agent.post('/api/v1/barista/redeem').send({ code }),
        agent.post('/api/v1/barista/redeem').send({ code }),
      ]);

      const statuses = [resultA.status, resultB.status].sort();
      expect(statuses).toEqual([200, 409]);

      expect(await redemptionLedgerRows(userId)).toHaveLength(1);

      const allRows = await db
        .select()
        .from(schema.creditLedgerEntries)
        .where(eq(schema.creditLedgerEntries.userId, userId));
      const balance = allRows.reduce((sum, row) => sum + row.amount, 0);
      expect(balance).toBe(0); // 5 granted, exactly 5 deducted once — never negative, never double-deducted
    });
  });

  describe('dropped/failed request leaves state untouched', () => {
    it('a scan rejected by a post-claim check (insufficient credits) rolls back the code to pending, not stuck redeemed', async () => {
      const testApp = await app();
      const cafeId = await seedCafe();
      await seedBaristaCredentials(cafeId, '1234');
      // Sufficient credits at creation time, drained before the scan — the
      // same "changed between creation and scan" scenario as the
      // "insufficient credits at scan time" suite above, but asserting on
      // the code's row status (pending, not redeemed) rather than the
      // ledger, i.e. that the failed post-claim check actually rolled back
      // the atomic UPDATE that claimed the code (ADR-0006).
      const { userId, code } = await createPendingRedemption(testApp, {
        cafeId,
        creditPrice: 10,
        credits: 10,
      });
      const [membership] = await db
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.userId, userId));
      await db.insert(schema.creditLedgerEntries).values({
        userId,
        amount: -10,
        reason: 'redemption',
        periodStart: new Date(Date.now() - 1000),
        periodEnd: membership!.currentPeriodEnd!,
      });

      const agent = request.agent(testApp);
      await agent.post('/api/v1/barista/authenticate').send({ cafeId, pin: '1234' }).expect(200);
      await agent.post('/api/v1/barista/redeem').send({ code }).expect(409);

      const [row] = await db
        .select({ status: schema.redemptionCodes.status })
        .from(schema.redemptionCodes)
        .where(eq(schema.redemptionCodes.userId, userId));
      expect(row?.status).toBe('pending');
    });
  });

  describe('GET /barista/today', () => {
    it("lists only this cafe's redemptions from today", async () => {
      const testApp = await app();
      const cafeA = await seedCafe('Cafe A');
      const cafeB = await seedCafe('Cafe B');
      await seedBaristaCredentials(cafeA, '1111');
      await seedBaristaCredentials(cafeB, '2222');

      const redemptionA = await createPendingRedemption(testApp, { cafeId: cafeA, creditPrice: 3 });
      const redemptionB = await createPendingRedemption(testApp, { cafeId: cafeB, creditPrice: 3 });

      const agentA = request.agent(testApp);
      await agentA
        .post('/api/v1/barista/authenticate')
        .send({ cafeId: cafeA, pin: '1111' })
        .expect(200);
      await agentA.post('/api/v1/barista/redeem').send({ code: redemptionA.code }).expect(200);

      const agentB = request.agent(testApp);
      await agentB
        .post('/api/v1/barista/authenticate')
        .send({ cafeId: cafeB, pin: '2222' })
        .expect(200);
      await agentB.post('/api/v1/barista/redeem').send({ code: redemptionB.code }).expect(200);

      const todayA = await agentA.get('/api/v1/barista/today');
      expect(todayA.status).toBe(200);
      expect(todayA.body.data).toHaveLength(1);
      expect(todayA.body.data[0].drinkName).toBe('Oat Milk Latte');
    });
  });
});
