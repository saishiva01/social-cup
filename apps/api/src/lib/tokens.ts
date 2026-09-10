import { createHash, randomBytes, randomInt } from 'node:crypto';

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

/** PRD Module 8, verbatim: a redemption code is "valid five minutes." */
export const REDEMPTION_CODE_TTL_MS = 5 * 60 * 1000;

/**
 * How long a barista device stays trusted after a successful PIN entry
 * before it must re-enter the PIN (PRD: "that device stays trusted", no
 * duration given). An interim engineering default — see
 * docs/decisions/open-questions.md — not a value the PRD specifies.
 */
export const BARISTA_TRUSTED_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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

// Crockford base32: excludes I/L/O/U so a member reading the code aloud, or
// a barista typing it, can't confuse a digit for a letter. 32 divides 256
// evenly, so mapping a random byte with `% 32` is exactly uniform — no
// modulo bias to reason about.
const REDEMPTION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REDEMPTION_CODE_LENGTH = 12;

/**
 * The member-facing primary redemption code (PRD Module 8). No camera/QR
 * scanning is implemented in this phase (see docs/architecture/redemption.md
 * "What's explicitly deferred") — every redemption goes through manual
 * entry of this code or the six-digit backup code, so it is sized to be
 * readable and typeable, not just maximally dense: 12 characters from a
 * 32-symbol alphabet is 60 bits of entropy, far more than the 5-minute
 * window and rate-limited barista endpoint need to resist guessing.
 * Formatted in 4-4-4 groups for display; `normalizeRedemptionCode` strips
 * that formatting back out before hashing/comparison.
 */
export function generateRedemptionCode(): string {
  const bytes = randomBytes(REDEMPTION_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REDEMPTION_CODE_LENGTH; i++) {
    code += REDEMPTION_CODE_ALPHABET[bytes[i]! % REDEMPTION_CODE_ALPHABET.length];
  }
  return code;
}

/** PRD Module 8: "a six-digit backup code," used when a camera can't read the primary code. */
export function generateBackupCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Accepts a code exactly as a human might type it (mixed case, with
 * grouping dashes/spaces) and returns the canonical form used for hashing
 * and lookup. Applied identically when generating, displaying, and
 * validating a code so formatting never affects matching.
 */
export function normalizeRedemptionCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}
