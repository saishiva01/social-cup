import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { AdminMemberDetail, AdminMemberListItem, PaginatedResult } from '@social-cup/types';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

import { recordAuditLog } from '../domain/auditLog.js';
import { NotFoundError } from '../errors/AppError.js';

const {
  cafes,
  creditLedgerEntries,
  drinks,
  memberships,
  redemptionVoids,
  redemptions,
  refreshTokens,
  users,
} = schema;

export interface AdminMemberListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'visitor' | 'incomplete' | 'active' | 'past_due' | 'canceled';
}

export interface AdminMemberService {
  list(params: AdminMemberListParams): Promise<PaginatedResult<AdminMemberListItem>>;
  getDetail(userId: string): Promise<AdminMemberDetail>;
  setDeactivated(
    userId: string,
    deactivated: boolean,
    adminUserId: string,
  ): Promise<AdminMemberListItem>;
}

type MemberJoinRow = {
  id: string;
  email: string;
  displayName: string;
  neighborhood: string | null;
  emailVerifiedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  membershipStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};

/** One query for every row's credit balance instead of one balance query per member (N+1). */
async function creditsByUser(db: DB, rows: MemberJoinRow[]): Promise<Map<string, number>> {
  const userIds = rows.map((row) => row.id);
  if (userIds.length === 0) return new Map();

  const sums = await db
    .select({
      userId: creditLedgerEntries.userId,
      periodEnd: creditLedgerEntries.periodEnd,
      total: sql<string>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
    })
    .from(creditLedgerEntries)
    .where(inArray(creditLedgerEntries.userId, userIds))
    .groupBy(creditLedgerEntries.userId, creditLedgerEntries.periodEnd);

  const byKey = new Map(
    sums.map((row) => [`${row.userId}|${row.periodEnd.getTime()}`, Number(row.total)]),
  );

  const result = new Map<string, number>();
  for (const row of rows) {
    if (!row.currentPeriodEnd) {
      result.set(row.id, 0);
      continue;
    }
    result.set(row.id, byKey.get(`${row.id}|${row.currentPeriodEnd.getTime()}`) ?? 0);
  }
  return result;
}

function toListItem(row: MemberJoinRow, credits: number): AdminMemberListItem {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    neighborhood: row.neighborhood,
    emailVerified: row.emailVerifiedAt !== null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    membershipStatus:
      (row.membershipStatus as AdminMemberListItem['membershipStatus']) ?? 'visitor',
    credits,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
    createdAt: row.createdAt.toISOString(),
  };
}

const memberSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  neighborhood: users.neighborhood,
  emailVerifiedAt: users.emailVerifiedAt,
  deactivatedAt: users.deactivatedAt,
  createdAt: users.createdAt,
  membershipStatus: memberships.status,
  currentPeriodEnd: memberships.currentPeriodEnd,
  cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
};

/**
 * Admin member administration (PRD Module 9: "list every member with plan,
 * status, join date, credits remaining; deactivate an account when
 * needed"). Read-only except for the one deactivate/reactivate toggle the
 * PRD explicitly calls for — no arbitrary profile-editing power is added.
 * Never returns `passwordHash` or any refresh/reset token — see
 * `memberSelection` above, which whitelists exactly the columns sent back.
 */
export function createAdminMemberService(deps: { db: DB }): AdminMemberService {
  const { db } = deps;

  return {
    async list({ page, pageSize, search, status }) {
      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(users.email, `%${search}%`), ilike(users.displayName, `%${search}%`)),
        );
      }
      if (status === 'visitor') {
        conditions.push(isNull(memberships.userId));
      } else if (status) {
        conditions.push(eq(memberships.status, status));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.id))
        .where(where);
      const totalItems = totalRow?.value ?? 0;

      const rows = await db
        .select(memberSelection)
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const credits = await creditsByUser(db, rows);
      const items = rows.map((row) => toListItem(row, credits.get(row.id) ?? 0));

      return {
        items,
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    },

    async getDetail(userId) {
      const [row] = await db
        .select(memberSelection)
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.id))
        .where(eq(users.id, userId));
      if (!row) throw new NotFoundError('Member not found');

      const credits = await creditsByUser(db, [row]);

      const recent = await db
        .select({
          id: redemptions.id,
          cafeName: cafes.name,
          drinkName: drinks.name,
          creditAmount: redemptions.creditAmount,
          redeemedAt: redemptions.redeemedAt,
          voided: sql<boolean>`${redemptionVoids.id} is not null`,
        })
        .from(redemptions)
        .innerJoin(cafes, eq(redemptions.cafeId, cafes.id))
        .innerJoin(drinks, eq(redemptions.drinkId, drinks.id))
        .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id))
        .where(eq(redemptions.userId, userId))
        .orderBy(desc(redemptions.redeemedAt))
        .limit(10);

      return {
        ...toListItem(row, credits.get(userId) ?? 0),
        recentRedemptions: recent.map((item) => ({
          id: item.id,
          cafeName: item.cafeName,
          drinkName: item.drinkName,
          creditAmount: item.creditAmount,
          redeemedAt: item.redeemedAt.toISOString(),
          voided: item.voided,
        })),
      };
    },

    async setDeactivated(userId, deactivated, adminUserId) {
      const [row] = await db
        .update(users)
        .set({ deactivatedAt: deactivated ? new Date() : null, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!row) throw new NotFoundError('Member not found');

      if (deactivated) {
        // Bounds the deactivation to the refresh-token lifecycle immediately
        // (login is already blocked by authService — see
        // packages/database/src/schema/users.ts for the accepted
        // access-token-window tradeoff this shares with password reset).
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      }

      await recordAuditLog(db, {
        adminUserId,
        action: deactivated ? 'member.deactivate' : 'member.reactivate',
        entityType: 'user',
        entityId: userId,
      });

      const [detailRow] = await db
        .select(memberSelection)
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.id))
        .where(eq(users.id, userId));
      const credits = await creditsByUser(db, [detailRow!]);
      return toListItem(detailRow!, credits.get(userId) ?? 0);
    },
  };
}
