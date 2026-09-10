import type {
  AuthTokens,
  LoginResult,
  RefreshResult,
  RegisterResult,
  ResetPasswordResult,
  VerifyEmailResult,
} from '@social-cup/types';
import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { toPublicUser } from '../domain/publicUser.js';
import { loadEnv } from '../env.js';
import {
  AccountDeactivatedError,
  EmailNotVerifiedError,
  UnauthorizedError,
  ValidationError,
} from '../errors/AppError.js';
import { isUniqueViolation } from '../lib/dbErrors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
} from '../lib/tokens.js';
import type { EmailService } from './email/EmailService.js';
import { passwordResetEmail } from './email/templates/passwordResetEmail.js';
import { verificationEmail } from './email/templates/verificationEmail.js';

/**
 * Builds an email link from trusted server config (APP_WEB_URL) — never from
 * user input — so a link in an email can never be redirected to an
 * attacker-controlled host. The token is placed via URLSearchParams, not
 * string concatenation, so it's always correctly encoded.
 */
function buildWebUrl(baseUrl: string, path: string, token: string): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export interface AuthService {
  register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<RegisterResult>;
  verifyEmail(token: string): Promise<VerifyEmailResult>;
  resendVerification(email: string): Promise<void>;
  login(input: { email: string; password: string }): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  logout(refreshToken: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(input: { token: string; password: string }): Promise<ResetPasswordResult>;
}

/**
 * All identity & onboarding flows (PRD Module 2). Server-authoritative by
 * construction: every credential check happens here against the database,
 * tokens are generated and hashed here, and emails go out through the
 * injected EmailService abstraction — route handlers only parse input and
 * serialize output.
 */
export function createAuthService(deps: { db: DB; emailService: EmailService }): AuthService {
  const { db, emailService } = deps;

  async function issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const rawRefreshToken = generateOpaqueToken();
    await db.insert(schema.refreshTokens).values({
      userId,
      tokenHash: hashToken(rawRefreshToken),
      chainId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return {
      accessToken: signAccessToken({ sub: userId, email }),
      refreshToken: rawRefreshToken,
    };
  }

  async function sendVerificationEmail(userId: string): Promise<void> {
    const [user] = await db
      .select({ email: schema.users.email, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) return; // account gone between token creation and send
    const rawToken = generateOpaqueToken();
    await db.insert(schema.emailVerificationTokens).values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
    const { APP_WEB_URL } = loadEnv();
    await emailService.send(
      verificationEmail({
        to: user.email,
        displayName: user.displayName,
        verifyUrl: buildWebUrl(APP_WEB_URL, '/verify-email', rawToken),
      }),
    );
  }

  async function revokeChain(chainId: string): Promise<void> {
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(schema.refreshTokens.chainId, chainId), isNull(schema.refreshTokens.revokedAt)),
      );
  }

  return {
    async register(input) {
      const passwordHash = await hashPassword(input.password);

      let userId: string;
      try {
        const [created] = await db
          .insert(schema.users)
          .values({ email: input.email, passwordHash, displayName: input.displayName })
          .returning({ id: schema.users.id });
        // An INSERT with explicit values always returns exactly one row.
        userId = created!.id;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;

        // Duplicate email. The response is identical to a fresh registration
        // so the endpoint cannot enumerate accounts; if the existing account
        // is unverified, silently re-issue its verification email (the
        // endpoint's rate limiter bounds abuse of that).
        const [existing] = await db
          .select({ id: schema.users.id, emailVerifiedAt: schema.users.emailVerifiedAt })
          .from(schema.users)
          .where(eq(schema.users.email, input.email));
        if (existing && existing.emailVerifiedAt === null) {
          await sendVerificationEmail(existing.id);
        }
        return { message: 'Check your email to verify your account before signing in.' };
      }

      await sendVerificationEmail(userId);
      return { message: 'Check your email to verify your account before signing in.' };
    },

    async verifyEmail(token) {
      // Atomic single-use claim: only one request can consume the token.
      const [claimed] = await db
        .update(schema.emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.emailVerificationTokens.tokenHash, hashToken(token)),
            isNull(schema.emailVerificationTokens.usedAt),
            gt(schema.emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: schema.emailVerificationTokens.userId });

      if (!claimed) {
        // Invalid, expired, or already-used — deliberately one message.
        throw new ValidationError('This verification link is invalid or has expired.');
      }

      const [user] = await db
        .select({ id: schema.users.id, emailVerifiedAt: schema.users.emailVerifiedAt })
        .from(schema.users)
        .where(eq(schema.users.id, claimed.userId));
      if (!user) throw new ValidationError('This verification link is invalid or has expired.');

      if (user.emailVerifiedAt === null) {
        await db
          .update(schema.users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      }
      // Already-verified accounts with a still-valid link get the same
      // success — replay-safe and non-annoying.
      return { emailVerified: true };
    },

    async resendVerification(email) {
      const [user] = await db
        .select({ id: schema.users.id, emailVerifiedAt: schema.users.emailVerifiedAt })
        .from(schema.users)
        .where(eq(schema.users.email, email));
      // Generic behavior for unknown/already-verified accounts: no email, no
      // difference in the response.
      if (!user || user.emailVerifiedAt !== null) return;

      // Supersede any outstanding unused tokens so only the newest link works.
      await db
        .update(schema.emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.emailVerificationTokens.userId, user.id),
            isNull(schema.emailVerificationTokens.usedAt),
          ),
        );
      await sendVerificationEmail(user.id);
    },

    async login(input) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email));

      // Same error for unknown email and wrong password — no enumeration.
      const passwordMatches = user
        ? await verifyPassword(input.password, user.passwordHash)
        : false;
      if (!user || !passwordMatches) {
        throw new UnauthorizedError('Invalid email or password');
      }

      if (user.emailVerifiedAt === null) {
        throw new EmailNotVerifiedError();
      }

      // Checked after credentials (never before) — a wrong password on a
      // deactivated account still gets the generic invalid-credentials
      // response, never a signal that the account exists but is deactivated.
      if (user.deactivatedAt !== null) {
        throw new AccountDeactivatedError();
      }

      const tokens = await issueTokens(user.id, user.email);
      return { tokens, user: toPublicUser(user) };
    },

    async refresh(refreshToken) {
      const [row] = await db
        .select()
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.tokenHash, hashToken(refreshToken)));

      if (!row || row.revokedAt !== null) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      if (row.rotatedAt !== null) {
        // Reuse of an already-rotated token is the standard theft signal —
        // revoke the whole chain, forcing re-login on every device tied to it.
        await revokeChain(row.chainId);
        throw new UnauthorizedError('Invalid refresh token');
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        await db
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(schema.refreshTokens.id, row.id));
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Atomic claim: under concurrent use of the same token exactly one
      // request wins the rotation; the loser is treated as reuse.
      const [claimed] = await db
        .update(schema.refreshTokens)
        .set({ rotatedAt: new Date() })
        .where(
          and(
            eq(schema.refreshTokens.id, row.id),
            isNull(schema.refreshTokens.rotatedAt),
            isNull(schema.refreshTokens.revokedAt),
          ),
        )
        .returning({ id: schema.refreshTokens.id });
      if (!claimed) {
        await revokeChain(row.chainId);
        throw new UnauthorizedError('Invalid refresh token');
      }

      const [user] = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, row.userId));
      if (!user) throw new UnauthorizedError('Invalid refresh token');

      const rawRefreshToken = generateOpaqueToken();
      await db.insert(schema.refreshTokens).values({
        userId: row.userId,
        tokenHash: hashToken(rawRefreshToken),
        chainId: row.chainId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      });

      return {
        tokens: {
          accessToken: signAccessToken({ sub: user.id, email: user.email }),
          refreshToken: rawRefreshToken,
        },
      };
    },

    async logout(refreshToken) {
      const [row] = await db
        .select({ chainId: schema.refreshTokens.chainId })
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.tokenHash, hashToken(refreshToken)));
      if (row) {
        await revokeChain(row.chainId);
      }
      // Idempotent — unknown/already-revoked tokens are still a successful logout.
    },

    async forgotPassword(email) {
      const [account] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
        })
        .from(schema.users)
        .where(eq(schema.users.email, email));

      if (!account) return; // response is generic either way

      // Supersede outstanding unused reset tokens for this user.
      await db
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.passwordResetTokens.userId, account.id),
            isNull(schema.passwordResetTokens.usedAt),
          ),
        );

      const rawToken = generateOpaqueToken();
      await db.insert(schema.passwordResetTokens).values({
        userId: account.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });

      const { APP_WEB_URL } = loadEnv();
      await emailService.send(
        passwordResetEmail({
          to: account.email,
          displayName: account.displayName,
          resetUrl: buildWebUrl(APP_WEB_URL, '/reset-password', rawToken),
        }),
      );
    },

    async resetPassword(input) {
      // Atomic single-use claim — a replayed link can never reset twice.
      const [claimed] = await db
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.passwordResetTokens.tokenHash, hashToken(input.token)),
            isNull(schema.passwordResetTokens.usedAt),
            gt(schema.passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: schema.passwordResetTokens.userId });

      if (!claimed) {
        throw new ValidationError('This password reset link is invalid or has expired.');
      }

      const passwordHash = await hashPassword(input.password);
      await db
        .update(schema.users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(schema.users.id, claimed.userId));

      // A credential change invalidates every session — old refresh tokens
      // are dead even if they were captured before the reset.
      await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.refreshTokens.userId, claimed.userId),
            isNull(schema.refreshTokens.revokedAt),
          ),
        );

      return {
        message: 'Your password has been reset. You can now sign in with your new password.',
      };
    },
  };
}
