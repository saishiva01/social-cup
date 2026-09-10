import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { AdminDrink } from '@social-cup/types';
import type { AdminDrinkCreateInput, AdminDrinkUpdateInput } from '@social-cup/validation';
import { eq } from 'drizzle-orm';

import { cafeExists } from './adminCafeService.js';
import { recordAuditLog } from '../domain/auditLog.js';
import { NotFoundError } from '../errors/AppError.js';

const { drinks } = schema;

export interface AdminDrinkService {
  create(cafeId: string, input: AdminDrinkCreateInput, adminUserId: string): Promise<AdminDrink>;
  update(drinkId: string, fields: AdminDrinkUpdateInput, adminUserId: string): Promise<AdminDrink>;
  getDetail(drinkId: string): Promise<AdminDrink>;
  listForCafe(cafeId: string): Promise<AdminDrink[]>;
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

/**
 * Admin drink/menu management (PRD Module 9: "Menu and pricing"). Pricing
 * changes here only ever affect *future* redemptions — every existing
 * `redemption_codes`/`redemptions` row already snapshotted its own
 * `creditPrice` at the moment it was created/redeemed (see
 * packages/database/src/schema/redemptions.ts), so editing a drink's price
 * can never rewrite a historical redemption's value. Deactivating a drink
 * (`isActive: false`) hides it from discovery and blocks new redemption
 * codes from being created against it (redemptionService.create already
 * checks `drink.isActive`) without touching any past record.
 */
export function createAdminDrinkService(deps: { db: DB }): AdminDrinkService {
  const { db } = deps;

  return {
    async create(cafeId, input, adminUserId) {
      if (!(await cafeExists(db, cafeId))) throw new NotFoundError('Cafe not found');

      const [row] = await db
        .insert(drinks)
        .values({
          cafeId,
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? null,
          photoUrl: input.photoUrl ?? null,
          retailPriceCents: input.retailPriceCents,
          creditPrice: input.creditPrice,
          signature: input.signature ?? false,
          isActive: input.isActive ?? true,
        })
        .returning();

      await recordAuditLog(db, {
        adminUserId,
        action: 'drink.create',
        entityType: 'drink',
        entityId: row!.id,
        metadata: { cafeId, name: row!.name },
      });

      return toAdminDrink(row!);
    },

    async update(drinkId, fields, adminUserId) {
      const set: Partial<typeof drinks.$inferInsert> = { updatedAt: new Date() };
      if (fields.name !== undefined) set.name = fields.name;
      if (fields.description !== undefined) set.description = fields.description;
      if (fields.category !== undefined) set.category = fields.category;
      if (fields.photoUrl !== undefined) set.photoUrl = fields.photoUrl;
      if (fields.retailPriceCents !== undefined) set.retailPriceCents = fields.retailPriceCents;
      if (fields.creditPrice !== undefined) set.creditPrice = fields.creditPrice;
      if (fields.signature !== undefined) set.signature = fields.signature;
      if (fields.isActive !== undefined) set.isActive = fields.isActive;

      const [row] = await db.update(drinks).set(set).where(eq(drinks.id, drinkId)).returning();
      if (!row) throw new NotFoundError('Drink not found');

      await recordAuditLog(db, {
        adminUserId,
        action: 'drink.update',
        entityType: 'drink',
        entityId: drinkId,
        metadata: { fields: Object.keys(fields) },
      });

      return toAdminDrink(row);
    },

    async getDetail(drinkId) {
      const [row] = await db.select().from(drinks).where(eq(drinks.id, drinkId));
      if (!row) throw new NotFoundError('Drink not found');
      return toAdminDrink(row);
    },

    async listForCafe(cafeId) {
      if (!(await cafeExists(db, cafeId))) throw new NotFoundError('Cafe not found');
      const rows = await db
        .select()
        .from(drinks)
        .where(eq(drinks.cafeId, cafeId))
        .orderBy(drinks.name);
      return rows.map(toAdminDrink);
    },
  };
}
