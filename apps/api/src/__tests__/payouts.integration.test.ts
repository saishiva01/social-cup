import { randomUUID } from 'node:crypto';

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
 * Phase 6 admin redemption log, voids, payouts, statements, and manual
 * payments (PRD Module 9; PRD 9.7 voids). This is the money-path half of
 * Phase 6 — see docs/architecture/redemption.md and ADR-0006 for the
 * concurrency pattern voids build on (a plain unique-insert claim, the same
 * idea generalized).
 */
describe.skipIf(skip)('admin payouts, redemptions, and voids (real Postgres)', () => {
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
  async function registeredUser(): Promise<{ userId: string; email: string }> {
    userCounter += 1;
    const email = `member${userCounter}@example.com`;
    const testApp = await app();
    await request(testApp)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: `Member ${userCounter}` })
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const token = latest.text.match(/token=(\S+)/)![1]!;
    await request(testApp).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    const login = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct-horse' });
    return { userId: login.body.data.user.id as string, email };
  }

  async function adminUser(): Promise<{ accessToken: string; userId: string; testApp: Express }> {
    userCounter += 1;
    const email = `admin${userCounter}@example.com`;
    const testApp = await app();
    await request(testApp)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: `Admin ${userCounter}` })
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const token = latest.text.match(/token=(\S+)/)![1]!;
    await request(testApp).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    const login = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct-horse' });
    const userId = login.body.data.user.id as string;
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
    return { accessToken: login.body.data.tokens.accessToken as string, userId, testApp };
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

  async function seedDrink(
    cafeId: string,
    fields: Partial<typeof schema.drinks.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await db
      .insert(schema.drinks)
      .values({ cafeId, name: 'Oat Milk Latte', retailPriceCents: 500, creditPrice: 5, ...fields })
      .returning();
    return row!.id;
  }

  async function grantMembership(
    userId: string,
    credits = 30,
  ): Promise<{ periodStart: Date; periodEnd: Date }> {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(schema.memberships).values({
      userId,
      stripeCustomerId: `cus_${userId}`,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
    if (credits !== 0) {
      await db
        .insert(schema.creditLedgerEntries)
        .values({ userId, amount: credits, reason: 'monthly_grant', periodStart, periodEnd });
    }
    return { periodStart, periodEnd };
  }

  /** Directly constructs a *completed* redemption, bypassing the member/barista flow (already covered end-to-end in redemptions/barista integration tests) — see those files' comments for why this fixture pattern is used for Phase 5+ tests. */
  async function seedRedemption(input: {
    userId: string;
    cafeId: string;
    drinkId: string;
    creditAmount?: number;
    payoutRateCents?: number;
    redeemedAt?: Date;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<{ redemptionId: string; ledgerEntryId: string }> {
    const creditAmount = input.creditAmount ?? 5;
    const payoutRateCents = input.payoutRateCents ?? 70;
    const redeemedAt = input.redeemedAt ?? new Date();
    const suffix = randomUUID();

    const [code] = await db
      .insert(schema.redemptionCodes)
      .values({
        userId: input.userId,
        cafeId: input.cafeId,
        drinkId: input.drinkId,
        codeHash: `code-${suffix}`,
        backupCodeHash: `backup-${suffix}`,
        creditPrice: creditAmount,
        status: 'redeemed',
        expiresAt: new Date(redeemedAt.getTime() + 60_000),
        redeemedAt,
      })
      .returning();
    const [ledgerEntry] = await db
      .insert(schema.creditLedgerEntries)
      .values({
        userId: input.userId,
        amount: -creditAmount,
        reason: 'redemption',
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
      .returning();
    const [device] = await db
      .insert(schema.baristaTrustedDevices)
      .values({
        cafeId: input.cafeId,
        deviceTokenHash: `device-${suffix}`,
        pinVersionAtIssue: 1,
        expiresAt: new Date(redeemedAt.getTime() + 1000),
      })
      .returning();
    const [redemption] = await db
      .insert(schema.redemptions)
      .values({
        redemptionCodeId: code!.id,
        userId: input.userId,
        cafeId: input.cafeId,
        drinkId: input.drinkId,
        creditLedgerEntryId: ledgerEntry!.id,
        baristaTrustedDeviceId: device!.id,
        creditAmount,
        payoutRateCents,
        redeemedAt,
      })
      .returning();
    return { redemptionId: redemption!.id, ledgerEntryId: ledgerEntry!.id };
  }

  async function creditBalance(userId: string, periodEnd: Date): Promise<number> {
    const rows = await db
      .select()
      .from(schema.creditLedgerEntries)
      .where(eq(schema.creditLedgerEntries.userId, userId));
    return rows
      .filter((row) => row.periodEnd.getTime() === periodEnd.getTime())
      .reduce((sum, row) => sum + row.amount, 0);
  }

  describe('redemption log', () => {
    it('rejects a non-admin', async () => {
      const member = await registeredUser();
      const res = await request(await app()).get('/api/v1/admin/redemptions');
      expect(res.status).toBe(401);
      expect(member.userId).toBeTruthy();
    });

    it('lists redemptions with payout amount computed from the snapshot', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        payoutRateCents: 70,
        periodStart,
        periodEnd,
      });

      const res = await request(testApp)
        .get('/api/v1/admin/redemptions')
        .set(...authHeader(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        creditAmount: 5,
        payoutRateCents: 70,
        payoutAmountCents: 350,
        voided: false,
      });
    });

    it('filters by cafe and date range', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeA = await seedCafe({ name: 'Cafe A' });
      const cafeB = await seedCafe({ name: 'Cafe B' });
      const drinkA = await seedDrink(cafeA);
      const drinkB = await seedDrink(cafeB);
      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await seedRedemption({
        userId: member.userId,
        cafeId: cafeA,
        drinkId: drinkA,
        periodStart,
        periodEnd,
        redeemedAt: old,
      });
      await seedRedemption({
        userId: member.userId,
        cafeId: cafeB,
        drinkId: drinkB,
        periodStart,
        periodEnd,
      });

      const byCafe = await request(testApp)
        .get(`/api/v1/admin/redemptions?cafeId=${cafeB}`)
        .set(...authHeader(accessToken));
      expect(byCafe.body.data.items).toHaveLength(1);
      expect(byCafe.body.data.items[0].cafeId).toBe(cafeB);

      const byDate = await request(testApp)
        .get(`/api/v1/admin/redemptions?dateFrom=${new Date(Date.now() - 1000).toISOString()}`)
        .set(...authHeader(accessToken));
      expect(byDate.body.data.items).toHaveLength(1);
      expect(byDate.body.data.items[0].cafeId).toBe(cafeB);
    });
  });

  describe('voids', () => {
    it('voids a redemption: restores credits via a compensating ledger entry and marks the redemption voided without mutating it', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId, 30);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        payoutRateCents: 70,
        periodStart,
        periodEnd,
      });

      const balanceBefore = await creditBalance(member.userId, periodEnd);
      expect(balanceBefore).toBe(25); // 30 granted - 5 redeemed

      const voidRes = await request(testApp)
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .set(...authHeader(accessToken))
        .send({ reason: 'Barista scanned the wrong drink' });

      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data).toMatchObject({
        redemptionId,
        reason: 'Barista scanned the wrong drink',
        compensatingCreditAmount: 5,
      });

      const balanceAfter = await creditBalance(member.userId, periodEnd);
      expect(balanceAfter).toBe(30); // fully restored

      const [redemptionRow] = await db
        .select()
        .from(schema.redemptions)
        .where(eq(schema.redemptions.id, redemptionId));
      expect(redemptionRow).toMatchObject({ creditAmount: 5, payoutRateCents: 70 }); // original row untouched

      const detail = await request(testApp)
        .get(`/api/v1/admin/redemptions/${redemptionId}`)
        .set(...authHeader(accessToken));
      expect(detail.body.data.voided).toBe(true);
      expect(detail.body.data.voidReason).toBe('Barista scanned the wrong drink');

      const ledgerRows = await db
        .select()
        .from(schema.creditLedgerEntries)
        .where(eq(schema.creditLedgerEntries.userId, member.userId));
      expect(ledgerRows.filter((row) => row.reason === 'redemption_void')).toHaveLength(1);
    });

    it('rejects voiding an already-voided redemption', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        periodStart,
        periodEnd,
      });

      await request(testApp)
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .set(...authHeader(accessToken))
        .send({ reason: 'first' });
      const secondRes = await request(testApp)
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .set(...authHeader(accessToken))
        .send({ reason: 'second' });

      expect(secondRes.status).toBe(409);
    });

    it('404s voiding a nonexistent redemption', async () => {
      const { accessToken, testApp } = await adminUser();
      const res = await request(testApp)
        .post('/api/v1/admin/redemptions/00000000-0000-0000-0000-000000000000/void')
        .set(...authHeader(accessToken))
        .send({ reason: 'x' });
      expect(res.status).toBe(404);
    });

    it('rejects a void with no reason', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        periodStart,
        periodEnd,
      });

      const res = await request(testApp)
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .set(...authHeader(accessToken))
        .send({ reason: '' });
      expect(res.status).toBe(400);
    });

    it('rejects a non-admin attempting to void', async () => {
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        periodStart,
        periodEnd,
      });

      const res = await request(await app())
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .send({ reason: 'nope' });
      expect(res.status).toBe(401);
    });

    it('exactly one of two concurrent void requests for the same redemption succeeds, with exactly one compensating ledger entry', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId, 30);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        periodStart,
        periodEnd,
      });

      const [first, second] = await Promise.all([
        request(testApp)
          .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
          .set(...authHeader(accessToken))
          .send({ reason: 'race A' }),
        request(testApp)
          .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
          .set(...authHeader(accessToken))
          .send({ reason: 'race B' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const ledgerRows = await db
        .select()
        .from(schema.creditLedgerEntries)
        .where(eq(schema.creditLedgerEntries.userId, member.userId));
      expect(ledgerRows.filter((row) => row.reason === 'redemption_void')).toHaveLength(1);

      const balance = await creditBalance(member.userId, periodEnd);
      expect(balance).toBe(30); // exactly one restoration, never double-restored
    });
  });

  describe('payouts', () => {
    it('computes owed amount from the redemption-time snapshot, unaffected by a later cafe payout-rate change', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });
      const redeemedAt = new Date();
      await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        payoutRateCents: 70,
        periodStart,
        periodEnd,
        redeemedAt,
      });

      // Admin changes the cafe's *current* payout rate after the fact.
      await request(testApp)
        .patch(`/api/v1/admin/cafes/${cafeId}/payout-rate`)
        .set(...authHeader(accessToken))
        .send({ payoutRateCents: 999 });

      const from = new Date(redeemedAt.getTime() - 60_000).toISOString();
      const to = new Date(redeemedAt.getTime() + 60_000).toISOString();
      const res = await request(testApp)
        .get(`/api/v1/admin/payouts?periodStart=${from}&periodEnd=${to}`)
        .set(...authHeader(accessToken));

      expect(res.status).toBe(200);
      const cafeSummary = res.body.data.find((row: { cafeId: string }) => row.cafeId === cafeId);
      expect(cafeSummary).toMatchObject({
        redemptionCount: 1,
        totalCredits: 5,
        amountOwedCents: 350,
        paymentStatus: 'unpaid',
      });
    });

    it('excludes a voided redemption from the payout total', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5 });
      const redeemedAt = new Date();
      const { redemptionId } = await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        payoutRateCents: 70,
        periodStart,
        periodEnd,
        redeemedAt,
      });
      await request(testApp)
        .post(`/api/v1/admin/redemptions/${redemptionId}/void`)
        .set(...authHeader(accessToken))
        .send({ reason: 'mistake' });

      const from = new Date(redeemedAt.getTime() - 60_000).toISOString();
      const to = new Date(redeemedAt.getTime() + 60_000).toISOString();
      const res = await request(testApp)
        .get(`/api/v1/admin/payouts?periodStart=${from}&periodEnd=${to}`)
        .set(...authHeader(accessToken));

      const cafeSummary = res.body.data.find((row: { cafeId: string }) => row.cafeId === cafeId);
      expect(cafeSummary).toBeUndefined();
    });

    it('generates a statement and a formula-injection-safe CSV', async () => {
      const { accessToken, testApp } = await adminUser();
      const member = await registeredUser();
      await db
        .update(schema.users)
        .set({ displayName: '=cmd|/c calc' })
        .where(eq(schema.users.id, member.userId));
      const { periodStart, periodEnd } = await grantMembership(member.userId);
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { creditPrice: 5, name: 'Latte, "The Usual"' });
      const redeemedAt = new Date();
      await seedRedemption({
        userId: member.userId,
        cafeId,
        drinkId,
        creditAmount: 5,
        payoutRateCents: 70,
        periodStart,
        periodEnd,
        redeemedAt,
      });

      const from = new Date(redeemedAt.getTime() - 60_000).toISOString();
      const to = new Date(redeemedAt.getTime() + 60_000).toISOString();

      const statementRes = await request(testApp)
        .get(`/api/v1/admin/payouts/${cafeId}/statement?periodStart=${from}&periodEnd=${to}`)
        .set(...authHeader(accessToken));
      expect(statementRes.status).toBe(200);
      expect(statementRes.body.data.totals).toMatchObject({
        redemptionCount: 1,
        totalCredits: 5,
        totalAmountOwedCents: 350,
      });

      const csvRes = await request(testApp)
        .get(`/api/v1/admin/payouts/${cafeId}/statement.csv?periodStart=${from}&periodEnd=${to}`)
        .set(...authHeader(accessToken));
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers['content-type']).toMatch(/text\/csv/);
      expect(csvRes.headers['content-disposition']).toMatch(/attachment/);

      const csv = csvRes.text;
      // The member's display name starts with "=" — a formula-injection
      // attempt — and must be neutralized with a leading apostrophe, never
      // passed through raw.
      expect(csv).toContain("'=cmd|/c calc");
      expect(csv).not.toMatch(/[,\n]=cmd\|\/c calc/);
      // A drink name containing a comma and a quote must be properly quoted/escaped.
      expect(csv).toContain('"Latte, ""The Usual"""');
      expect(csv.startsWith('﻿')).toBe(true);
    });
  });

  describe('recorded payments', () => {
    it('records a manual payment and it appears in the statement history', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const periodStart = new Date('2026-01-01T00:00:00Z').toISOString();
      const periodEnd = new Date('2026-02-01T00:00:00Z').toISOString();

      const res = await request(testApp)
        .post(`/api/v1/admin/payouts/${cafeId}/payments`)
        .set(...authHeader(accessToken))
        .send({ periodStart, periodEnd, amountCents: 5000, reference: 'ACH-1234' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ cafeId, amountCents: 5000, reference: 'ACH-1234' });

      const statementRes = await request(testApp)
        .get(
          `/api/v1/admin/payouts/${cafeId}/statement?periodStart=${periodStart}&periodEnd=${periodEnd}`,
        )
        .set(...authHeader(accessToken));
      expect(statementRes.body.data.payments).toHaveLength(1);
      expect(statementRes.body.data.totalRecordedCents).toBe(5000);
    });

    it('rejects an identical duplicate payment', async () => {
      const { accessToken, testApp } = await adminUser();
      const cafeId = await seedCafe();
      const periodStart = new Date('2026-01-01T00:00:00Z').toISOString();
      const periodEnd = new Date('2026-02-01T00:00:00Z').toISOString();
      const body = { periodStart, periodEnd, amountCents: 5000, reference: 'ACH-1234' };

      await request(testApp)
        .post(`/api/v1/admin/payouts/${cafeId}/payments`)
        .set(...authHeader(accessToken))
        .send(body)
        .expect(201);
      const dupRes = await request(testApp)
        .post(`/api/v1/admin/payouts/${cafeId}/payments`)
        .set(...authHeader(accessToken))
        .send(body);
      expect(dupRes.status).toBe(409);
    });

    it('is auditable: who recorded it is derivable from the admin_audit_log', async () => {
      const { accessToken, testApp, userId } = await adminUser();
      const cafeId = await seedCafe();
      const periodStart = new Date('2026-01-01T00:00:00Z').toISOString();
      const periodEnd = new Date('2026-02-01T00:00:00Z').toISOString();

      await request(testApp)
        .post(`/api/v1/admin/payouts/${cafeId}/payments`)
        .set(...authHeader(accessToken))
        .send({ periodStart, periodEnd, amountCents: 1200 })
        .expect(201);

      const auditRows = await db
        .select()
        .from(schema.adminAuditLog)
        .where(eq(schema.adminAuditLog.action, 'payout.payment.record'));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        adminUserId: userId,
        entityType: 'cafe',
        entityId: cafeId,
      });
    });

    it('rejects a non-admin recording a payment', async () => {
      const cafeId = await seedCafe();
      const res = await request(await app())
        .post(`/api/v1/admin/payouts/${cafeId}/payments`)
        .send({
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 1000).toISOString(),
          amountCents: 100,
        });
      expect(res.status).toBe(401);
    });
  });
});
