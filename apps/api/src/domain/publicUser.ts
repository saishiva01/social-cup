import type { schema } from '@social-cup/database';
import type { CoffeePreference, PublicUser } from '@social-cup/types';

type UserRow = typeof schema.users.$inferSelect;

/**
 * The only user shape ever sent to clients. passwordHash, verification
 * timestamps, and any future security state are deliberately absent — this
 * is the single serialization point so a later route can't accidentally
 * leak a field by building its own response object.
 */
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    profilePhotoUrl: user.profilePhotoUrl,
    coffeePreferences: user.coffeePreferences as CoffeePreference[],
    neighborhood: user.neighborhood,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role as PublicUser['role'],
  };
}
