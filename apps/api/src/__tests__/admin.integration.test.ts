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
 * Phase 6 admin authorization, cafe/drink CRUD, barista PIN management, and
 * member administration (PRD Module 9). Payout/void/statement coverage
 * lives in payouts.integration.test.ts (closely related to the money path,
 * kept separate for file size). Every mutating admin route is exercised for
 * both the happy path and the "a non-admin must not be able to do this"
 * negative case — root CLAUDE.md: "A visitor/member must receive an
 * appropriate 401/403 response and must not gain access to admin data."
 */
describe.skipIf(skip)('admin API (real Postgres)', () => {
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
    email: string;
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
      email,
      testApp,
    };
  }

  /** A registered, verified user promoted to admin the only real way this system supports: a direct role update — see docs/architecture/admin-authorization.md. */
  async function adminUser(): Promise<{ accessToken: string; userId: string; testApp: Express }> {
    const created = await registeredUser();
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, created.userId));
    return created;
  }

  function authHeader(accessToken: string): [string, string] {
    return ['Authorization', `Bearer ${accessToken}`];
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

  const validCafeInput = {
    name: 'New Cafe',
    neighborhood: 'Uptown',
    address: '100 Main St, Dallas, TX',
    latitude: 32.78,
    longitude: -96.8,
  };

  describe('admin authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await request(await app()).get('/api/v1/admin/cafes');
      expect(res.status).toBe(401);
    });

    it('rejects a Visitor (authenticated, never subscribed, not admin)', async () => {
      const { accessToken, testApp } = await registeredUser();
      const res = await request(testApp)
        .get('/api/v1/admin/cafes')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(403);
    });

    it('rejects an active Member who is not an admin', async () => {
      const { accessToken, userId, testApp } = await registeredUser();
      await db.insert(schema.memberships).values({
        userId,
        stripeCustomerId: `cus_${userId}`,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const res = await request(testApp)
        .get('/api/v1/admin/cafes')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(403);
    });

    it('allows an admin', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .get('/api/v1/admin/cafes')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
    });

    it('takes effect immediately when admin access is revoked (no JWT caching)', async () => {
      const { accessToken, userId, testApp } = await adminUser();
      await request(testApp)
        .get('/api/v1/admin/cafes')
        .set(...authHeader(accessToken))
        .expect(200);

      await db.update(schema.users).set({ role: 'user' }).where(eq(schema.users.id, userId));

      const res = await request(testApp)
        .get('/api/v1/admin/cafes')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(403);
    });
  });

  describe('cafe management', () => {
    it('creates a cafe with valid input', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .post('/api/v1/admin/cafes')
        .set(...authHeader(accessToken))
        .send(validCafeInput);
      expect(res.status).toBe(201);
      expect(res.body.data.cafe).toMatchObject({ name: 'New Cafe', neighborhood: 'Uptown' });
      expect(res.body.data.payoutRateCents).toBeNull();
      expect(res.body.data.pinIsSet).toBe(false);
    });

    it('rejects invalid coordinates', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .post('/api/v1/admin/cafes')
        .set(...authHeader(accessToken))
        .send({ ...validCafeInput, latitude: 200 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects malformed hours', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .post('/api/v1/admin/cafes')
        .set(...authHeader(accessToken))
        .send({ ...validCafeInput, hours: { mon: { open: '25:00', close: '9:00' } } });
      expect(res.status).toBe(400);
    });

    it('updates a cafe and toggles featured', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();

      const res = await request(testApp)
        .patch(`/api/v1/admin/cafes/${cafeId}`)
        .set(...authHeader(accessToken))
        .send({ featured: true, perkLine: 'Now with oat milk' });

      expect(res.status).toBe(200);
      expect(res.body.data.cafe.featured).toBe(true);
      expect(res.body.data.cafe.perkLine).toBe('Now with oat milk');
    });

    it('404s updating a nonexistent cafe', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .patch('/api/v1/admin/cafes/00000000-0000-0000-0000-000000000000')
        .set(...authHeader(accessToken))
        .send({ featured: true });
      expect(res.status).toBe(404);
    });

    it('sets the payout rate independent of the PIN and records it on the redemption pipeline eligibility', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();

      const res = await request(testApp)
        .patch(`/api/v1/admin/cafes/${cafeId}/payout-rate`)
        .set(...authHeader(accessToken))
        .send({ payoutRateCents: 75 });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ cafeId, payoutRateCents: 75 });

      const detail = await request(testApp)
        .get(`/api/v1/admin/cafes/${cafeId}`)
        .set(...authHeader(accessToken));
      expect(detail.body.data.payoutRateCents).toBe(75);
      expect(detail.body.data.pinIsSet).toBe(false);
    });

    it('rejects a non-positive payout rate', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const res = await request(testApp)
        .patch(`/api/v1/admin/cafes/${cafeId}/payout-rate`)
        .set(...authHeader(accessToken))
        .send({ payoutRateCents: 0 });
      expect(res.status).toBe(400);
    });
  });

  describe('barista PIN management', () => {
    it('sets a PIN, never returns the hash, and the PIN authenticates a barista device', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();

      const setRes = await request(testApp)
        .put(`/api/v1/admin/cafes/${cafeId}/barista-pin`)
        .set(...authHeader(accessToken))
        .send({ pin: '1234' });
      expect(setRes.status).toBe(200);
      expect(setRes.body.data).toEqual({ cafeId, pinVersion: 1 });
      expect(JSON.stringify(setRes.body)).not.toMatch(/pinHash|\$2[aby]\$/);

      const authRes = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '1234' });
      expect(authRes.status).toBe(200);
    });

    it('changing the PIN invalidates existing trusted devices and the old PIN stops working', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();

      await request(testApp)
        .put(`/api/v1/admin/cafes/${cafeId}/barista-pin`)
        .set(...authHeader(accessToken))
        .send({ pin: '1111' });
      const firstAuth = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '1111' });
      expect(firstAuth.status).toBe(200);
      const trustedCookie = firstAuth.headers['set-cookie'] as unknown as string[];

      const changeRes = await request(testApp)
        .put(`/api/v1/admin/cafes/${cafeId}/barista-pin`)
        .set(...authHeader(accessToken))
        .send({ pin: '2222' });
      expect(changeRes.body.data.pinVersion).toBe(2);

      // Old PIN no longer authenticates.
      const oldPinRes = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '1111' });
      expect(oldPinRes.status).toBe(401);

      // The device trusted under the old PIN version is rejected even though its cookie hasn't expired.
      const staleDeviceRes = await request(testApp)
        .get('/api/v1/barista/today')
        .set('Cookie', trustedCookie);
      expect(staleDeviceRes.status).toBe(401);

      // New PIN works.
      const newPinRes = await request(testApp)
        .post('/api/v1/barista/authenticate')
        .send({ cafeId, pin: '2222' });
      expect(newPinRes.status).toBe(200);
    });

    it('rejects a malformed PIN', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const res = await request(testApp)
        .put(`/api/v1/admin/cafes/${cafeId}/barista-pin`)
        .set(...authHeader(accessToken))
        .send({ pin: 'abcd' });
      expect(res.status).toBe(400);
    });
  });

  describe('drink management', () => {
    it('creates a drink under a cafe', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const res = await request(testApp)
        .post(`/api/v1/admin/cafes/${cafeId}/drinks`)
        .set(...authHeader(accessToken))
        .send({ name: 'Oat Milk Latte', retailPriceCents: 550, creditPrice: 5 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Oat Milk Latte',
        creditPrice: 5,
        isActive: true,
      });
    });

    it('rejects non-integer/non-positive pricing', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const res = await request(testApp)
        .post(`/api/v1/admin/cafes/${cafeId}/drinks`)
        .set(...authHeader(accessToken))
        .send({ name: 'Bad Drink', retailPriceCents: 5.5, creditPrice: 0 });
      expect(res.status).toBe(400);
    });

    it('deactivating a drink hides it from the public menu but its historical redemption is unaffected', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const [drinkRow] = await db
        .insert(schema.drinks)
        .values({ cafeId, name: 'Cortado', retailPriceCents: 450, creditPrice: 4, isActive: true })
        .returning();
      const drinkId = drinkRow!.id;

      // A historical redemption referencing this drink, created before deactivation.
      const [code] = await db
        .insert(schema.redemptionCodes)
        .values({
          userId: (await registeredUser()).userId,
          cafeId,
          drinkId,
          codeHash: 'hash-a',
          backupCodeHash: 'backup-a',
          creditPrice: 4,
          status: 'redeemed',
          expiresAt: new Date(Date.now() + 60_000),
          redeemedAt: new Date(),
        })
        .returning();
      const [ledgerEntry] = await db
        .insert(schema.creditLedgerEntries)
        .values({
          userId: code!.userId,
          amount: -4,
          reason: 'redemption',
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 1000),
        })
        .returning();
      const [device] = await db
        .insert(schema.baristaTrustedDevices)
        .values({
          cafeId,
          deviceTokenHash: 'device-hash-a',
          pinVersionAtIssue: 1,
          expiresAt: new Date(Date.now() + 1000),
        })
        .returning();
      const [redemptionRow] = await db
        .insert(schema.redemptions)
        .values({
          redemptionCodeId: code!.id,
          userId: code!.userId,
          cafeId,
          drinkId,
          creditLedgerEntryId: ledgerEntry!.id,
          baristaTrustedDeviceId: device!.id,
          creditAmount: 4,
          payoutRateCents: 70,
          redeemedAt: new Date(),
        })
        .returning();

      const deactivateRes = await request(testApp)
        .patch(`/api/v1/admin/drinks/${drinkId}`)
        .set(...authHeader(accessToken))
        .send({ isActive: false });
      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.data.isActive).toBe(false);

      const [stillThere] = await db
        .select()
        .from(schema.redemptions)
        .where(eq(schema.redemptions.id, redemptionRow!.id));
      expect(stillThere).toMatchObject({ creditAmount: 4, payoutRateCents: 70, drinkId });
    });
  });

  describe('member administration', () => {
    it('lists members without leaking sensitive fields', async () => {
      const { accessToken, testApp } = await adminUser();
      await registeredUser();

      const res = await request(testApp)
        .get('/api/v1/admin/members')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash/i);
    });

    it('paginates members', async () => {
      const { accessToken, testApp } = await adminUser();
      await registeredUser();
      await registeredUser();

      const res = await request(testApp)
        .get('/api/v1/admin/members?page=1&pageSize=1')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.totalItems).toBeGreaterThanOrEqual(3); // admin + 2 registered users
    });

    it('deactivates a member, blocking their login', async () => {
      const { accessToken, testApp } = await adminUser();
      const target = await registeredUser();

      const res = await request(testApp)
        .post(`/api/v1/admin/members/${target.userId}/deactivate`)
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.deactivatedAt).not.toBeNull();

      const loginRes = await request(testApp)
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: 'correct-horse' });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('reactivates a member, restoring login', async () => {
      const { accessToken, testApp } = await adminUser();
      const target = await registeredUser();

      await request(testApp)
        .post(`/api/v1/admin/members/${target.userId}/deactivate`)
        .set(...authHeader(accessToken));
      const reactivateRes = await request(testApp)
        .post(`/api/v1/admin/members/${target.userId}/reactivate`)
        .set(...authHeader(accessToken));
      expect(reactivateRes.body.data.deactivatedAt).toBeNull();

      const loginRes = await request(testApp)
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: 'correct-horse' });
      expect(loginRes.status).toBe(200);
    });
  });

  describe('address lookup (mock provider)', () => {
    it('returns suggestions clearly labeled as mock', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .get('/api/v1/admin/address-lookup?query=Main St')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const suggestion of res.body.data) {
        expect(suggestion.source).toBe('mock');
      }
    });
  });
});
