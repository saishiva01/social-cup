import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { and, eq, sql } from 'drizzle-orm';

const { creditLedgerEntries } = schema;

/** The transaction handle Drizzle passes into `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * "Current balance" is the sum of ledger entries for the membership's
 * *current* billing period, not an all-time sum — see ADR-0011. A member
 * with no period yet (never subscribed) has no credits. Shared by
 * `membershipService` (read-only status display) and
 * `redemptionService`/`baristaService` (eligibility checks and the
 * inside-transaction re-check before a scan deducts credits) so there is
 * exactly one definition of "balance" in the codebase, not two that could
 * drift apart.
 */
export async function getCreditBalance(
  db: DB | Tx,
  userId: string,
  periodEnd: Date | null,
): Promise<number> {
  if (!periodEnd) return 0;
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${creditLedgerEntries.amount}), 0)` })
    .from(creditLedgerEntries)
    .where(
      and(eq(creditLedgerEntries.userId, userId), eq(creditLedgerEntries.periodEnd, periodEnd)),
    );
  return Number(row?.total ?? 0);
}
