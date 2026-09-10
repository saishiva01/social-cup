import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type {
  AdminCafeDetail,
  AdminCafeListItem,
  AdminDrink,
  PaginatedResult,
  SetBaristaPinResult,
} from '@social-cup/types';
import type { AdminCafeCreateInput, AdminCafeUpdateInput } from '@social-cup/validation';
import { count, eq, ilike, inArray, sql } from 'drizzle-orm';

import { recordAuditLog } from '../domain/auditLog.js';
import { toCafe } from '../domain/cafeMappers.js';
import { NotFoundError } from '../errors/AppError.js';
import { hashPassword } from '../lib/password.js';

const { cafeBaristaCredentials, cafes, drinks } = schema;

export interface AdminCafeListParams {
  page: number;
  pageSize: number;
  search?: string;
}

export interface AdminCafeService {
  list(params: AdminCafeListParams): Promise<PaginatedResult<AdminCafeListItem>>;
  getDetail(cafeId: string): Promise<AdminCafeDetail>;
  create(input: AdminCafeCreateInput, adminUserId: string): Promise<AdminCafeDetail>;
  update(
    cafeId: string,
    fields: AdminCafeUpdateInput,
    adminUserId: string,
  ): Promise<AdminCafeDetail>;
  setPayoutRate(
    cafeId: string,
    payoutRateCents: number,
    adminUserId: string,
  ): Promise<{ cafeId: string; payoutRateCents: number }>;
  setPin(cafeId: string, pin: string, adminUserId: string): Promise<SetBaristaPinResult>;
}

function toAdminDrink(row: typeof drinks.$inferSelect): AdminDrink {
  return {
    id: row.id,
    cafeId: row.cafeId,
    name: row.name,
    description: row.description,
    category: row.category,
    photoUrl: row.photoUrl,
    retailPriceCents: row.retailPriceCents,
    creditPrice: row.creditPrice,
    signature: row.signature,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function credentialsFor(
  db: DB,
  cafeId: string,
): Promise<{ payoutRateCents: number | null; pinIsSet: boolean }> {
  const [row] = await db
    .select({
      payoutRateCents: cafeBaristaCredentials.payoutRateCents,
      pinHash: cafeBaristaCredentials.pinHash,
    })
    .from(cafeBaristaCredentials)
    .where(eq(cafeBaristaCredentials.cafeId, cafeId));
  return {
    payoutRateCents: row?.payoutRateCents ?? null,
    pinIsSet: row?.pinHash !== undefined && row?.pinHash !== null,
  };
}

async function toDetail(db: DB, cafeRow: typeof cafes.$inferSelect): Promise<AdminCafeDetail> {
  const [credentials, drinkRows] = await Promise.all([
    credentialsFor(db, cafeRow.id),
    db.select().from(drinks).where(eq(drinks.cafeId, cafeRow.id)).orderBy(drinks.name),
  ]);
  return {
    cafe: toCafe(cafeRow),
    payoutRateCents: credentials.payoutRateCents,
    pinIsSet: credentials.pinIsSet,
    drinks: drinkRows.map(toAdminDrink),
  };
}

/**
 * Admin cafe management (PRD Module 9: cafe onboarding, payout rate, PIN).
 * Every mutating method is called only from a route already gated by
 * `requireAdmin` — see routes/v1/admin/cafes.ts — and records a minimal
 * audit-log entry (root CLAUDE.md: cafe changes, payout rate changes, and
 * PIN changes must all be auditable).
 *
 * Deliberately no cafe delete/deactivate here: `drinks`, `redemption_codes`,
 * and `redemptions` all cascade-delete from `cafes` (see
 * packages/database/src/schema/{cafes,redemptions}.ts) — a hard delete of a
 * cafe with redemption history would destroy the audit trail
 * database-architecture.md's non-negotiable rules require staying immutable.
 * The PRD's "edit/remove a cafe" is ambiguous about what "remove" means once
 * a cafe has real financial history; see
 * docs/decisions/open-questions.md for this open item rather than silently
 * picking a destructive implementation.
 */
export function createAdminCafeService(deps: { db: DB }): AdminCafeService {
  const { db } = deps;

  return {
    async list({ page, pageSize, search }) {
      const where = search ? ilike(cafes.name, `%${search}%`) : undefined;

      const [totalRow] = await db.select({ value: count() }).from(cafes).where(where);
      const totalItems = totalRow?.value ?? 0;

      const rows = await db
        .select()
        .from(cafes)
        .where(where)
        .orderBy(cafes.name)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const cafeIds = rows.map((row) => row.id);
      const [credentialRows, drinkCountRows] = await Promise.all([
        cafeIds.length > 0
          ? db
              .select({
                cafeId: cafeBaristaCredentials.cafeId,
                payoutRateCents: cafeBaristaCredentials.payoutRateCents,
                pinHash: cafeBaristaCredentials.pinHash,
              })
              .from(cafeBaristaCredentials)
              .where(inArray(cafeBaristaCredentials.cafeId, cafeIds))
          : Promise.resolve([]),
        cafeIds.length > 0
          ? db
              .select({ cafeId: drinks.cafeId, value: count() })
              .from(drinks)
              .where(inArray(drinks.cafeId, cafeIds))
              .groupBy(drinks.cafeId)
          : Promise.resolve([]),
      ]);
      const credentialsByCafe = new Map(credentialRows.map((row) => [row.cafeId, row]));
      const drinkCountByCafe = new Map(drinkCountRows.map((row) => [row.cafeId, row.value]));

      const items: AdminCafeListItem[] = rows.map((row) => {
        const credentials = credentialsByCafe.get(row.id);
        return {
          id: row.id,
          name: row.name,
          neighborhood: row.neighborhood,
          featured: row.featured,
          payoutRateCents: credentials?.payoutRateCents ?? null,
          pinIsSet: credentials?.pinHash !== undefined && credentials?.pinHash !== null,
          drinkCount: drinkCountByCafe.get(row.id) ?? 0,
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      return {
        items,
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    },

    async getDetail(cafeId) {
      const [cafeRow] = await db.select().from(cafes).where(eq(cafes.id, cafeId));
      if (!cafeRow) throw new NotFoundError('Cafe not found');
      return toDetail(db, cafeRow);
    },

    async create(input, adminUserId) {
      const [row] = await db
        .insert(cafes)
        .values({
          name: input.name,
          perkLine: input.perkLine ?? null,
          neighborhood: input.neighborhood,
          address: input.address,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          photos: input.photos ?? [],
          vibeTags: input.vibeTags ?? [],
          hours: input.hours ?? {},
          featured: input.featured ?? false,
        })
        .returning();

      await recordAuditLog(db, {
        adminUserId,
        action: 'cafe.create',
        entityType: 'cafe',
        entityId: row!.id,
        metadata: { name: row!.name },
      });

      return toDetail(db, row!);
    },

    async update(cafeId, fields, adminUserId) {
      const set: Partial<typeof cafes.$inferInsert> = { updatedAt: new Date() };
      if (fields.name !== undefined) set.name = fields.name;
      if (fields.perkLine !== undefined) set.perkLine = fields.perkLine;
      if (fields.neighborhood !== undefined) set.neighborhood = fields.neighborhood;
      if (fields.address !== undefined) set.address = fields.address;
      if (fields.latitude !== undefined) set.latitude = String(fields.latitude);
      if (fields.longitude !== undefined) set.longitude = String(fields.longitude);
      if (fields.photos !== undefined) set.photos = fields.photos;
      if (fields.vibeTags !== undefined) set.vibeTags = fields.vibeTags;
      if (fields.hours !== undefined) set.hours = fields.hours;
      if (fields.featured !== undefined) set.featured = fields.featured;

      const [row] = await db.update(cafes).set(set).where(eq(cafes.id, cafeId)).returning();
      if (!row) throw new NotFoundError('Cafe not found');

      await recordAuditLog(db, {
        adminUserId,
        action: 'cafe.update',
        entityType: 'cafe',
        entityId: cafeId,
        metadata: { fields: Object.keys(fields) },
      });

      return toDetail(db, row);
    },

    async setPayoutRate(cafeId, payoutRateCents, adminUserId) {
      const [cafe] = await db.select({ id: cafes.id }).from(cafes).where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      await db
        .insert(cafeBaristaCredentials)
        .values({ cafeId, payoutRateCents })
        .onConflictDoUpdate({
          target: cafeBaristaCredentials.cafeId,
          set: { payoutRateCents, updatedAt: new Date() },
        });

      await recordAuditLog(db, {
        adminUserId,
        action: 'cafe.payout_rate.update',
        entityType: 'cafe',
        entityId: cafeId,
        metadata: { payoutRateCents },
      });

      return { cafeId, payoutRateCents };
    },

    async setPin(cafeId, pin, adminUserId) {
      const [cafe] = await db.select({ id: cafes.id }).from(cafes).where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      const pinHash = await hashPassword(pin);

      // Bumping pinVersion on every set/reset (including the first time) is
      // what invalidates every previously-trusted barista device at once —
      // see packages/database/src/schema/barista.ts and
      // docs/architecture/redemption.md.
      const [row] = await db
        .insert(cafeBaristaCredentials)
        .values({ cafeId, pinHash, pinVersion: 1 })
        .onConflictDoUpdate({
          target: cafeBaristaCredentials.cafeId,
          set: {
            pinHash,
            pinVersion: sql`${cafeBaristaCredentials.pinVersion} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ pinVersion: cafeBaristaCredentials.pinVersion });

      // Never log/audit the PIN or its hash — only the fact that it changed.
      await recordAuditLog(db, {
        adminUserId,
        action: 'cafe.pin.reset',
        entityType: 'cafe',
        entityId: cafeId,
        metadata: { pinVersion: row!.pinVersion },
      });

      return { cafeId, pinVersion: row!.pinVersion };
    },
  };
}

/**
 * Also used by adminDrinkService and admin routes needing a bare cafe
 * existence check without the full detail assembly.
 */
export async function cafeExists(db: DB, cafeId: string): Promise<boolean> {
  const [row] = await db.select({ id: cafes.id }).from(cafes).where(eq(cafes.id, cafeId));
  return row !== undefined;
}
