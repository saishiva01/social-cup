/**
 * DTOs for the Phase 1 identity & onboarding API surface (PRD Module 2).
 * Shared with the mobile client so the request/response shapes exist in one
 * place. These are wire types only — no server secrets, no internal ids
 * beyond the user's own id.
 */

export const COFFEE_PREFERENCES = ['matcha', 'espresso', 'cold_brew', 'latte'] as const;
export type CoffeePreference = (typeof COFFEE_PREFERENCES)[number];

/** Safe serialization of the users row — never includes passwordHash or security state. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  profilePhotoUrl: string | null;
  coffeePreferences: CoffeePreference[];
  neighborhood: string | null;
  emailVerified: boolean;
  /**
   * Server-side admin capability (Phase 6), orthogonal to Visitor/Member
   * subscription state (ADR-0008) — surfaced here only so a client can show
   * or hide admin-only UI; every admin API route re-checks this from the
   * database on every request (`requireAdmin`), never trusting this field.
   */
  role: 'user' | 'admin';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** data payload of POST /auth/login */
export interface LoginResult {
  tokens: AuthTokens;
  user: PublicUser;
}

/**
 * data payload of POST /auth/register. Deliberately carries no user data and
 * no account-existence signal — identical for a fresh registration and a
 * duplicate email, so the endpoint cannot be used to enumerate accounts.
 */
export interface RegisterResult {
  message: string;
}

/** data payload of POST /auth/refresh */
export interface RefreshResult {
  tokens: AuthTokens;
}

/** data payload of POST /auth/verify-email */
export interface VerifyEmailResult {
  emailVerified: true;
}

/** data payload of POST /auth/reset-password */
export interface ResetPasswordResult {
  message: string;
}

/** Fields a user may edit on their own profile (PATCH /me). */
export interface UpdateProfileInput {
  displayName?: string;
  profilePhotoUrl?: string | null;
  coffeePreferences?: CoffeePreference[];
  neighborhood?: string | null;
}
