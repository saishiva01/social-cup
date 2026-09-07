import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { loadEnv } from '../env.js';

// ADR-0004: short-lived access JWT + long-lived opaque, rotated refresh
// token. Durations not specified by the PRD beyond email verification (24h,
// per docs/architecture/authentication.md, since the PRD states no fixed
// expiry) and password reset (1h, PRD Module 2.2) — access/refresh lengths
// are an engineering default, recorded in that same doc.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** High-entropy opaque token for refresh/verification/reset — never a JWT. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Refresh/verification/reset tokens are stored only as this hash (see
 * docs/architecture/authentication.md) — the raw value exists solely in the
 * URL/body handed to the client for one use.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const { ACCESS_TOKEN_SECRET } = loadEnv();
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

/** Returns the verified payload, or null for an invalid/expired/malformed token. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const { ACCESS_TOKEN_SECRET } = loadEnv();
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null;
    const email = (decoded as jwt.JwtPayload & { email?: unknown }).email;
    if (typeof email !== 'string') return null;
    return { sub: decoded.sub, email };
  } catch {
    return null;
  }
}
