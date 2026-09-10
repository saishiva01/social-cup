import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type {
  PayoutPaymentRecord,
  PayoutPeriodSummaryItem,
  PayoutStatement,
  RecordPayoutPaymentResult,
} from '@social-cup/types';
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import { recordAuditLog } from '../domain/auditLog.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { buildCsv } from '../lib/csv.js';

const { cafePayoutPayments, cafes, drinks, redemptionVoids, redemptions, users } = schema;

export interface PayoutPeriod {
  periodStart: Date;
  periodEnd: Date;
}

export interface RecordPaymentInput extends PayoutPeriod {
  cafeId: string;
  amountCents: number;
  reference?: string | null;
  adminUserId: string;
}

export interface PayoutService {
  summary(period: PayoutPeriod): Promise<PayoutPeriodSummaryItem[]>;
  statement(cafeId: string, period: PayoutPeriod): Promise<PayoutStatement>;
  statementCsv(cafeId: string, period: PayoutPeriod): Promise<{ filename: string; csv: string }>;
  recordPayment(input: RecordPaymentInput): Promise<RecordPayoutPaymentResult>;
}

/** Not voided AND redeemed within the half-open [periodStart, periodEnd) window — the shared filter for every payout query below. */
function periodCondition(period: PayoutPeriod) {
  return and(
    gte(redemptions.redeemedAt, period.periodStart),
    lt(redemptions.redeemedAt, period.periodEnd),
    isNull(redemptionVoids.id),
  );
}

function paymentStatusFor(
  owedCents: number,
  recordedCents: number,
): PayoutPeriodSummaryItem['paymentStatus'] {
  if (recordedCents <= 0) return 'unpaid';
  return recordedCents >= owedCents ? 'recorded' : 'partially_recorded';
}

/**
 * Payout operations (PRD Module 9 "Payouts"). Every total is computed live
 * from `redemptions.creditAmount`/`payoutRateCents` — both already
 * snapshotted at redemption time (docs/architecture/redemption.md) — never
 * from a cafe's *current* payout rate, and a voided redemption (an
 * unmatched `redemption_voids` row) is excluded entirely, matching the
 * PRD's own "void... removes it from the cafe's payout." `cafe_payout_payments`
 * is append-only history of admin-recorded bank transfers; "amount owed
 * resets for next period" falls out of scoping every query to the chosen
 * `[periodStart, periodEnd)` window rather than any stored running balance.
 */
export function createPayoutService(deps: { db: DB }): PayoutService {
  const { db } = deps;

  return {
    async summary(period) {
      const owedRows = await db
        .select({
          cafeId: redemptions.cafeId,
          cafeName: cafes.name,
          redemptionCount: sql<string>`count(*)`,
          totalCredits: sql<string>`coalesce(sum(${redemptions.creditAmount}), 0)`,
          amountOwedCents: sql<string>`coalesce(sum(${redemptions.creditAmount} * ${redemptions.payoutRateCents}), 0)`,
        })
        .from(redemptions)
        .innerJoin(cafes, eq(redemptions.cafeId, cafes.id))
        .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id))
        .where(periodCondition(period))
        .groupBy(redemptions.cafeId, cafes.name);

      // Payments are matched to the exact period an admin chose when
      // recording them (same as recordPayment/statement below) — a payout
      // "period" is whatever range the admin picked, not an implicit
      // calendar month, so this is equality, not a range overlap.
      const paymentRows = await db
        .select({
          cafeId: cafePayoutPayments.cafeId,
          amountRecordedCents: sql<string>`coalesce(sum(${cafePayoutPayments.amountCents}), 0)`,
        })
        .from(cafePayoutPayments)
        .where(
          and(
            eq(cafePayoutPayments.periodStart, period.periodStart),
            eq(cafePayoutPayments.periodEnd, period.periodEnd),
          ),
        )
        .groupBy(cafePayoutPayments.cafeId);
      const recordedByCafe = new Map(
        paymentRows.map((row) => [row.cafeId, Number(row.amountRecordedCents)]),
      );

      return owedRows.map((row) => {
        const amountOwedCents = Number(row.amountOwedCents);
        const amountRecordedCents = recordedByCafe.get(row.cafeId) ?? 0;
        return {
          cafeId: row.cafeId,
          cafeName: row.cafeName,
          redemptionCount: Number(row.redemptionCount),
          totalCredits: Number(row.totalCredits),
          amountOwedCents,
          amountRecordedCents,
          paymentStatus: paymentStatusFor(amountOwedCents, amountRecordedCents),
        };
      });
    },

    async statement(cafeId, period) {
      const [cafe] = await db
        .select({ id: cafes.id, name: cafes.name })
        .from(cafes)
        .where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      const rows = await db
        .select({
          redemptionId: redemptions.id,
          memberDisplayName: users.displayName,
          drinkName: drinks.name,
          creditAmount: redemptions.creditAmount,
          payoutRateCents: redemptions.payoutRateCents,
          redeemedAt: redemptions.redeemedAt,
        })
        .from(redemptions)
        .innerJoin(users, eq(redemptions.userId, users.id))
        .innerJoin(drinks, eq(redemptions.drinkId, drinks.id))
        .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id))
        .where(and(eq(redemptions.cafeId, cafeId), periodCondition(period)))
        .orderBy(asc(redemptions.redeemedAt));

      const paymentRows = await db
        .select({
          id: cafePayoutPayments.id,
          cafeId: cafePayoutPayments.cafeId,
          periodStart: cafePayoutPayments.periodStart,
          periodEnd: cafePayoutPayments.periodEnd,
          amountCents: cafePayoutPayments.amountCents,
          reference: cafePayoutPayments.reference,
          recordedAt: cafePayoutPayments.recordedAt,
          recordedByAdminEmail: users.email,
        })
        .from(cafePayoutPayments)
        .innerJoin(users, eq(cafePayoutPayments.recordedByAdminId, users.id))
        .where(
          and(
            eq(cafePayoutPayments.cafeId, cafeId),
            eq(cafePayoutPayments.periodStart, period.periodStart),
            eq(cafePayoutPayments.periodEnd, period.periodEnd),
          ),
        )
        .orderBy(desc(cafePayoutPayments.recordedAt));

      const redemptionRows = rows.map((row) => ({
        redemptionId: row.redemptionId,
        memberDisplayName: row.memberDisplayName,
        drinkName: row.drinkName,
        creditAmount: row.creditAmount,
        payoutRateCents: row.payoutRateCents,
        payoutAmountCents: row.creditAmount * row.payoutRateCents,
        redeemedAt: row.redeemedAt.toISOString(),
      }));

      const totalAmountOwedCents = redemptionRows.reduce(
        (sum, row) => sum + row.payoutAmountCents,
        0,
      );
      const totalCredits = redemptionRows.reduce((sum, row) => sum + row.creditAmount, 0);

      return {
        cafeId: cafe.id,
        cafeName: cafe.name,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        redemptions: redemptionRows,
        totals: { redemptionCount: redemptionRows.length, totalCredits, totalAmountOwedCents },
        payments: paymentRows.map((row) => ({
          id: row.id,
          cafeId: row.cafeId,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd.toISOString(),
          amountCents: row.amountCents,
          reference: row.reference,
          recordedByAdminEmail: row.recordedByAdminEmail,
          recordedAt: row.recordedAt.toISOString(),
        })) satisfies PayoutPaymentRecord[],
        totalRecordedCents: paymentRows.reduce((sum, row) => sum + row.amountCents, 0),
      };
    },

    async statementCsv(cafeId, period) {
      const statement = await this.statement(cafeId, period);

      const headers = [
        'Date',
        'Member',
        'Drink',
        'Credits',
        'Payout Rate (cents/credit)',
        'Payout Amount (cents)',
      ];
      const rows = statement.redemptions.map((row) => [
        row.redeemedAt,
        row.memberDisplayName,
        row.drinkName,
        row.creditAmount,
        row.payoutRateCents,
        row.payoutAmountCents,
      ]);
      rows.push(['', '', '', '', 'Total', statement.totals.totalAmountOwedCents]);

      const safeCafeName = statement.cafeName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
      const filename = `${safeCafeName || 'cafe'}-payout-${period.periodStart.toISOString().slice(0, 10)}-to-${period.periodEnd.toISOString().slice(0, 10)}.csv`;

      return { filename, csv: buildCsv(headers, rows) };
    },

    async recordPayment({ cafeId, periodStart, periodEnd, amountCents, reference, adminUserId }) {
      const [cafe] = await db.select({ id: cafes.id }).from(cafes).where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      // Guards the common accidental-double-submit case without forbidding
      // deliberate multiple/partial payments for the same period (the PRD
      // doesn't specify a one-payment-per-period rule).
      const [duplicate] = await db
        .select({ id: cafePayoutPayments.id })
        .from(cafePayoutPayments)
        .where(
          and(
            eq(cafePayoutPayments.cafeId, cafeId),
            eq(cafePayoutPayments.periodStart, periodStart),
            eq(cafePayoutPayments.periodEnd, periodEnd),
            eq(cafePayoutPayments.amountCents, amountCents),
            reference
              ? eq(cafePayoutPayments.reference, reference)
              : isNull(cafePayoutPayments.reference),
          ),
        );
      if (duplicate) {
        throw new ConflictError(
          'An identical payment for this cafe and period was already recorded',
        );
      }

      const [row] = await db
        .insert(cafePayoutPayments)
        .values({
          cafeId,
          periodStart,
          periodEnd,
          amountCents,
          reference: reference ?? null,
          recordedByAdminId: adminUserId,
        })
        .returning();

      await recordAuditLog(db, {
        adminUserId,
        action: 'payout.payment.record',
        entityType: 'cafe',
        entityId: cafeId,
        metadata: {
          amountCents,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      });

      const [admin] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, adminUserId));

      return {
        id: row!.id,
        cafeId: row!.cafeId,
        periodStart: row!.periodStart.toISOString(),
        periodEnd: row!.periodEnd.toISOString(),
        amountCents: row!.amountCents,
        reference: row!.reference,
        recordedByAdminEmail: admin?.email ?? '',
        recordedAt: row!.recordedAt.toISOString(),
      };
    },
  };
}
