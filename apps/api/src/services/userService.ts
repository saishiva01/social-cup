import type { PublicUser } from '@social-cup/types';
import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { eq } from 'drizzle-orm';

import { toPublicUser } from '../domain/publicUser.js';
import { NotFoundError } from '../errors/AppError.js';

export interface UpdateProfileFields {
  displayName?: string;
  profilePhotoUrl?: string | null;
  coffeePreferences?: string[];
  neighborhood?: string | null;
}

export interface UserService {
  getProfile(userId: string): Promise<PublicUser>;
  updateProfile(userId: string, fields: UpdateProfileFields): Promise<PublicUser>;
}

/**
 * Profile read/update (PRD Module 2: display name, optional photo, coffee
 * preferences, home neighbourhood). Ownership is implicit — every method
 * takes the userId from the verified access token (req.auth), never from
 * the request body, so a client cannot touch another account's profile.
 */
export function createUserService(deps: { db: DB }): UserService {
  const { db } = deps;

  return {
    async getProfile(userId) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user) throw new NotFoundError('Account not found');
      return toPublicUser(user);
    },

    async updateProfile(userId, fields) {
      // Only whitelisted user-editable fields are ever written — account
      // role, verification state, and security state are server-controlled
      // and cannot be reached from here.
      const set: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
      if (fields.displayName !== undefined) set.displayName = fields.displayName;
      if (fields.profilePhotoUrl !== undefined) set.profilePhotoUrl = fields.profilePhotoUrl;
      if (fields.coffeePreferences !== undefined) set.coffeePreferences = fields.coffeePreferences;
      if (fields.neighborhood !== undefined) set.neighborhood = fields.neighborhood;

      const [updated] = await db
        .update(schema.users)
        .set(set)
        .where(eq(schema.users.id, userId))
        .returning();
      if (!updated) throw new NotFoundError('Account not found');
      return toPublicUser(updated);
    },
  };
}
