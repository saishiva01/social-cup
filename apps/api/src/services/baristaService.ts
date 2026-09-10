import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { BaristaAuthResult, BaristaRedeemResult, BaristaTodayItem } from '@social-cup/types';
import { and, desc, eq, gt, gte, or } from 'drizzle-orm';

import { getCreditBalance, type Tx } from '../domain/creditLedger.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import type { AppError } from '../errors/AppError.js';
import { verifyPassword } from '../lib/password.js';
import {
  BARISTA_TRUSTED_DEVICE_TTL_MS,
  generateOpaqueToken,
  hashToken,
  normalizeRedemptionCode,
} from '../lib/tokens.js';

const {
  baristaTrustedDevices,
  cafeBaristaCredentials,
  cafes,
  creditLedgerEntries,
  drinks,
  memberships,
  redemptionCodes,
  redemptions,
  users,
} = schema;

export interface BaristaService {
  authenticate(input: {
    cafeId: string;
    pin: string;
  }): Promise<{ rawDeviceToken: string; result: BaristaAuthResult }>;
  validateDeviceToken(rawToken: string): Promise<{ cafeId: string; deviceId: string } | null>;
  redeem(input: { cafeId: string; deviceId: string; code: string }): Promise<BaristaRedeemResult>;
  today(cafeId: string): Promise<BaristaTodayItem[]>;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || 'Member';
}

/**
 * One clear reason per red screen (PRD Module 8). Determined by a read-only
 * follow-up query *after* the atomic claim below already returned zero rows
 * — per ADR-0006, this is purely to explain a decision already made, never
 * used to decide whether to proceed with the deduction.
 */
async function explainRedeemFailure(tx: Tx, codeHash: string, cafeId: string): Promise<AppError> {
  const [row] = await tx
    .select()
    .from(redemptionCodes)
    .where(
      or(eq(redemptionCodes.codeHash, codeHash), eq(redemptionCodes.backupCodeHash, codeHash)),
    );

  if (!row) return new NotFoundError('Invalid code');
  if (row.cafeId !== cafeId) return new ConflictError('Not valid at this cafe');
  if (row.status === 'redeemed') return new ConflictError('Already redeemed');
  if (row.status === 'canceled') return new ConflictError('Code no longer valid');
  if (row.expiresAt.getTime() < Date.now()) return new ConflictError('Code expired');
  return new ConflictError('Invalid code');
}

/**
 * Barista-facing PIN authentication, trusted-device sessions, and the
 * scan/redeem transaction (PRD Module 8). `redeem` is the single most
 * safety-critical function in this codebase — see
 * docs/architecture/redemption.md and ADR-0006. The whole outcome (code
 * consumption, credit deduction, and the durable `redemptions` record)
 * commits or rolls back together: any failure after the atomic claim
 * re-opens the code as `pending` (the transaction never committed), so a
 * rejected scan never leaves credits deducted without a completed
 * redemption, or vice versa.
 */
export function createBaristaService(deps: { db: DB }): BaristaService {
  const { db } = deps;

  return {
    async authenticate({ cafeId, pin }) {
      const [cafe] = await db
        .select({ id: cafes.id, name: cafes.name })
        .from(cafes)
        .where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      const [credentials] = await db
        .select()
        .from(cafeBaristaCredentials)
        .where(eq(cafeBaristaCredentials.cafeId, cafeId));
      // Same generic message whether the cafe has no credentials row yet, an
      // admin has set a payout rate but not a PIN (pinHash null — Phase 6,
      // see packages/database/src/schema/barista.ts), or the PIN is simply
      // wrong — never confirm which case it was.
      if (!credentials || credentials.pinHash === null) throw new UnauthorizedError('Invalid PIN');

      const valid = await verifyPassword(pin, credentials.pinHash);
      if (!valid) throw new UnauthorizedError('Invalid PIN');

      const rawDeviceToken = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + BARISTA_TRUSTED_DEVICE_TTL_MS);

      await db.insert(baristaTrustedDevices).values({
        cafeId,
        deviceTokenHash: hashToken(rawDeviceToken),
        pinVersionAtIssue: credentials.pinVersion,
        expiresAt,
      });

      return {
        rawDeviceToken,
        result: {
          cafeId: cafe.id,
          cafeName: cafe.name,
          trustedForSeconds: Math.floor(BARISTA_TRUSTED_DEVICE_TTL_MS / 1000),
        },
      };
    },

    async validateDeviceToken(rawToken) {
      const tokenHash = hashToken(rawToken);
      const [device] = await db
        .select()
        .from(baristaTrustedDevices)
        .where(eq(baristaTrustedDevices.deviceTokenHash, tokenHash));
      if (!device) return null;
      if (device.expiresAt.getTime() < Date.now()) return null;

      const [credentials] = await db
        .select({ pinVersion: cafeBaristaCredentials.pinVersion })
        .from(cafeBaristaCredentials)
        .where(eq(cafeBaristaCredentials.cafeId, device.cafeId));
      // A PIN reset (Phase 6) bumps pinVersion, instantly invalidating every
      // device trusted under the old version without deleting rows here.
      if (!credentials || credentials.pinVersion !== device.pinVersionAtIssue) return null;

      await db
        .update(baristaTrustedDevices)
        .set({ lastUsedAt: new Date() })
        .where(eq(baristaTrustedDevices.id, device.id));

      return { cafeId: device.cafeId, deviceId: device.id };
    },

    async redeem({ cafeId, deviceId, code }) {
      const codeHash = hashToken(normalizeRedemptionCode(code));

      return db.transaction(async (tx) => {
        // ADR-0006: the single atomic conditional UPDATE. Postgres's MVCC
        // guarantees only one concurrent transaction can match
        // status = 'pending' for a given row — a second, near-simultaneous
        // scan of the same code sees zero rows here, never a second success.
        const [claimed] = await tx
          .update(redemptionCodes)
          .set({ status: 'redeemed', redeemedAt: new Date() })
          .where(
            and(
              or(
                eq(redemptionCodes.codeHash, codeHash),
                eq(redemptionCodes.backupCodeHash, codeHash),
              ),
              eq(redemptionCodes.cafeId, cafeId),
              eq(redemptionCodes.status, 'pending'),
              gt(redemptionCodes.expiresAt, new Date()),
            ),
          )
          .returning();

        if (!claimed) {
          throw await explainRedeemFailure(tx, codeHash, cafeId);
        }

        // Everything below re-validates state that could have changed
        // between code creation and this scan (e.g. a webhook downgraded
        // the membership in between). Throwing here rolls back the UPDATE
        // above too — the code reverts to `pending` as if this scan never
        // happened, so a member is never charged for a failed validation.
        const [membership] = await tx
          .select()
          .from(memberships)
          .where(eq(memberships.userId, claimed.userId));
        if (!membership || membership.status !== 'active') {
          throw new ConflictError('Membership inactive');
        }

        const balance = await getCreditBalance(tx, claimed.userId, membership.currentPeriodEnd);
        if (balance < claimed.creditPrice) {
          throw new ConflictError('Not enough credits');
        }

        const [credentials] = await tx
          .select({ payoutRateCents: cafeBaristaCredentials.payoutRateCents })
          .from(cafeBaristaCredentials)
          .where(eq(cafeBaristaCredentials.cafeId, cafeId));
        if (!credentials || credentials.payoutRateCents === null) {
          throw new ConflictError('Cafe not eligible for redemption');
        }

        // ADR-0003: the deduction is a new ledger row, never a mutable
        // counter decrement. periodStart/periodEnd are the membership's
        // *current* period (not the code's creation-time snapshot) — that's
        // what makes getCreditBalance's period-scoped sum include this
        // deduction against the right cycle.
        const [ledgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            userId: claimed.userId,
            amount: -claimed.creditPrice,
            reason: 'redemption',
            periodStart: membership.currentPeriodStart!,
            periodEnd: membership.currentPeriodEnd!,
          })
          .returning();

        const [redemptionRow] = await tx
          .insert(redemptions)
          .values({
            redemptionCodeId: claimed.id,
            userId: claimed.userId,
            cafeId,
            drinkId: claimed.drinkId,
            creditLedgerEntryId: ledgerEntry!.id,
            baristaTrustedDeviceId: deviceId,
            creditAmount: claimed.creditPrice,
            payoutRateCents: credentials.payoutRateCents,
            redeemedAt: claimed.redeemedAt!,
          })
          .returning();

        const [member] = await tx
          .select({ displayName: users.displayName, profilePhotoUrl: users.profilePhotoUrl })
          .from(users)
          .where(eq(users.id, claimed.userId));
        const [drink] = await tx
          .select({ name: drinks.name })
          .from(drinks)
          .where(eq(drinks.id, claimed.drinkId));

        return {
          memberFirstName: firstName(member?.displayName ?? 'Member'),
          memberPhotoUrl: member?.profilePhotoUrl ?? null,
          drinkName: drink?.name ?? '',
          creditsDeducted: claimed.creditPrice,
          redeemedAt: redemptionRow!.redeemedAt.toISOString(),
        };
      });
    },

    async today(cafeId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const rows = await db
        .select({
          id: redemptions.id,
          redeemedAt: redemptions.redeemedAt,
          creditAmount: redemptions.creditAmount,
          drinkName: drinks.name,
          memberDisplayName: users.displayName,
        })
        .from(redemptions)
        .innerJoin(drinks, eq(redemptions.drinkId, drinks.id))
        .innerJoin(users, eq(redemptions.userId, users.id))
        .where(and(eq(redemptions.cafeId, cafeId), gte(redemptions.redeemedAt, startOfDay)))
        .orderBy(desc(redemptions.redeemedAt));

      return rows.map((row) => ({
        id: row.id,
        memberFirstName: firstName(row.memberDisplayName),
        drinkName: row.drinkName,
        creditsDeducted: row.creditAmount,
        redeemedAt: row.redeemedAt.toISOString(),
      }));
    },
  };
}
