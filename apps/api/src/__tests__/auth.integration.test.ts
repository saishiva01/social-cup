import { schema } from '@social-cup/database';
import { isNull } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashToken } from '../lib/tokens.js';
import {
  setupTestDatabase,
  TEST_DATABASE_URL,
  truncateAll,
  extractTokenFromUrl,
} from './helpers/db.js';
import { makeTestApp, RecordingEmailService } from './helpers/app.js';

const skip = !TEST_DATABASE_URL;

vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));

describe.skipIf(skip)('auth flows (real Postgres)', () => {
  let client: Awaited<ReturnType<typeof setupTestDatabase>>['client'];
  let db: Awaited<ReturnType<typeof setupTestDatabase>>['db'];
  let close: Awaited<ReturnType<typeof setupTestDatabase>>['close'];
  let emails: RecordingEmailService;

  beforeAll(async () => {
    ({ client, db, close } = await setupTestDatabase(TEST_DATABASE_URL!));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(client);
    emails = new RecordingEmailService();
  });

  async function app(): Promise<Express> {
    return makeTestApp(client, emails);
  }

  const registerBody = {
    email: 'ada@example.com',
    password: 'correct-horse',
    displayName: 'Ada Lovelace',
  };

  function verificationTokenFromLatestEmail(): string {
    const latest = emails.sent.at(-1);
    expect(latest).toBeDefined();
    const url = latest!.text.match(/https?:\/\/\S+|socialcup:\/\/\S+/)?.[0];
    expect(url).toBeDefined();
    return extractTokenFromUrl(url!);
  }

  describe('registration', () => {
    it('creates an account, hashes the password, and sends a verification email', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { message: expect.any(String) },
      });

      const user = (await db.select().from(schema.users))[0]!;
      expect(user.email).toBe('ada@example.com');
      expect(user.passwordHash).not.toBe('correct-horse');
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user.displayName).toBe('Ada Lovelace');
      expect(user.emailVerifiedAt).toBeNull();

      expect(emails.sent).toHaveLength(1);
      const sent = emails.sent[0]!;
      expect(sent.to).toBe('ada@example.com');
      expect(sent.subject).toContain('Verify');
      expect(sent.text).not.toContain('correct-horse');
    });

    it('never returns the password or password hash anywhere in the response', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('correct-horse');
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('password_hash');
    });

    it('rejects an invalid email', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/register')
        .send({ ...registerBody, email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a password below the minimum length', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/register')
        .send({ ...registerBody, password: 'short' });
      expect(res.status).toBe(400);
    });

    it('rejects a missing display name', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/register')
        .send({ email: 'ada@example.com', password: 'correct-horse' });
      expect(res.status).toBe(400);
    });

    it('returns an identical response for a duplicate email (no enumeration)', async () => {
      const first = await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody);
      const second = await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);

      const user = (await db.select().from(schema.users))[0]!;
      expect(user.email).toBe('ada@example.com');
    });

    it('treats emails as case-insensitive for uniqueness', async () => {
      const first = await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody);
      const second = await request(await app())
        .post('/api/v1/auth/register')
        .send({ ...registerBody, email: 'ADA@Example.COM' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);

      const user = (await db.select().from(schema.users))[0]!;
      expect(user.email).toBe('ada@example.com');
    });

    it('stores the normalized email and lets the user log in with any casing', async () => {
      const reg = await request(await app())
        .post('/api/v1/auth/register')
        .send({ ...registerBody, email: '  Ada@Example.COM ' });

      expect(reg.status).toBe(201);

      const token = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);

      const login = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: 'ada@example.com', password: 'correct-horse' });
      expect(login.status).toBe(200);
    });

    it('enforces the registration rate limit', async () => {
      const testApp = await app();
      for (let i = 0; i < 10; i += 1) {
        const res = await request(testApp)
          .post('/api/v1/auth/register')
          .send({ ...registerBody, email: `user${i}@example.com` });
        expect(res.status).toBe(201);
      }
      const blocked = await request(testApp).post('/api/v1/auth/register').send(registerBody);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('email verification', () => {
    it('verifies the account and unlocks login', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();

      const verify = await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token });
      expect(verify.status).toBe(200);
      expect(verify.body.data.emailVerified).toBe(true);

      const user = (await db.select().from(schema.users))[0]!;
      expect(user.emailVerifiedAt).not.toBeNull();

      const login = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      expect(login.status).toBe(200);
    });

    it('rejects an invalid token', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'garbage' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an expired token', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();

      await db
        .update(schema.emailVerificationTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .execute();

      const res = await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('invalid or has expired');
    });

    it('rejects a reused token — single use', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();

      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);
      const replay = await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token });
      expect(replay.status).toBe(400);
    });

    it('is idempotent for an already-verified account with a still-valid token', async () => {
      const created = (
        await db
          .insert(schema.users)
          .values({
            email: registerBody.email,
            passwordHash: 'x',
            displayName: registerBody.displayName,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: schema.users.id })
      )[0]!;
      await db.insert(schema.emailVerificationTokens).values({
        userId: created.id,
        tokenHash: hashToken('still-valid'),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'still-valid' });
      expect(res.status).toBe(200);
      expect(res.body.data.emailVerified).toBe(true);
    });

    it('resend sends a fresh link for an unverified account', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      emails.reset();

      const res = await request(await app())
        .post('/api/v1/auth/resend-verification')
        .send({ email: registerBody.email });
      expect(res.status).toBe(200);

      expect(emails.sent).toHaveLength(1);
      expect(emails.sent[0]!.to).toBe('ada@example.com');

      // The new token supersedes the old one — only the newest link works.
      const token = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);
    });

    it('resend is a silent no-op for an unknown email', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nobody@example.com' });
      expect(res.status).toBe(200);
      expect(emails.sent).toHaveLength(0);
    });

    it('resend is a silent no-op for an already-verified account', async () => {
      const created = (
        await db
          .insert(schema.users)
          .values({
            email: registerBody.email,
            passwordHash: 'x',
            displayName: registerBody.displayName,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: schema.users.id })
      )[0]!;
      await db.insert(schema.emailVerificationTokens).values({
        userId: created.id,
        tokenHash: hashToken('t'),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token: 't' })
        .expect(200);
      emails.reset();

      const res = await request(await app())
        .post('/api/v1/auth/resend-verification')
        .send({ email: registerBody.email });
      expect(res.status).toBe(200);
      expect(emails.sent).toHaveLength(0);
    });

    it('enforces the resend-verification rate limit', async () => {
      const testApp = await app();
      for (let i = 0; i < 5; i += 1) {
        const res = await request(testApp)
          .post('/api/v1/auth/resend-verification')
          .send({ email: 'nobody@example.com' });
        expect(res.status).toBe(200);
      }
      const blocked = await request(testApp)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'nobody@example.com' });
      expect(blocked.status).toBe(429);
    });
  });

  describe('login', () => {
    async function registerAndVerify(): Promise<void> {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);
    }

    it('returns tokens and a safe user for valid credentials', async () => {
      await registerAndVerify();

      const res = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.tokens.refreshToken).toBeTruthy();
      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        profilePhotoUrl: null,
        coffeePreferences: [],
        neighborhood: null,
        emailVerified: true,
      });
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('password_hash');
      expect(body).not.toContain(registerBody.password);
    });

    it('rejects a wrong password with a generic message', async () => {
      await registerAndVerify();
      const res = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('rejects an unknown email with the same generic message (no enumeration)', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@example.com', password: 'whatever-123' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('rejects an unverified account with a distinct, credential-gated error', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const res = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('enforces the login rate limit', async () => {
      await registerAndVerify();
      const testApp = await app();
      for (let i = 0; i < 10; i += 1) {
        const res = await request(testApp)
          .post('/api/v1/auth/login')
          .send({ email: registerBody.email, password: 'wrong-password' });
        expect(res.status).toBe(401);
      }
      const blocked = await request(testApp)
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      expect(blocked.status).toBe(429);
    });
  });

  describe('refresh', () => {
    async function login(): Promise<{ accessToken: string; refreshToken: string }> {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);
      const res = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      return res.body.data.tokens as { accessToken: string; refreshToken: string };
    }

    it('rotates the refresh token and returns fresh tokens', async () => {
      const { refreshToken } = await login();

      const res = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken);
    });

    it('rejects a reused (already rotated) refresh token and revokes the chain', async () => {
      const { refreshToken } = await login();

      const first = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(first.status).toBe(200);
      const newRefresh = first.body.data.tokens.refreshToken as string;

      // Replaying the old token is treated as theft → whole chain revoked.
      const replay = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(replay.status).toBe(401);

      const afterRevoke = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefresh });
      expect(afterRevoke.status).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'garbage-token' });
      expect(res.status).toBe(401);
    });

    it('rejects a refresh token after logout', async () => {
      const { refreshToken } = await login();
      await request(await app())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      const res = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(401);
    });

    it('rejects a revoked refresh token (credential compromise)', async () => {
      const { refreshToken } = await login();
      // Revoke the chain directly, as a password reset would.
      await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(isNull(schema.refreshTokens.revokedAt))
        .execute();

      const res = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token chain and is idempotent', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const token = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);
      const loginRes = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      const { refreshToken } = loginRes.body.data.tokens;

      await request(await app())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
      // Unknown/already-revoked token still logs out cleanly.
      await request(await app())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      const res = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(401);
    });
  });

  describe('password reset', () => {
    it('returns the same generic response for unknown and known emails', async () => {
      const unknown = await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });
      expect(unknown.status).toBe(200);
      expect(unknown.body.data.message).toContain('If an account exists');

      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);

      const known = await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: registerBody.email });
      expect(known.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
    });

    it('sends a reset email with a one-hour link', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);

      await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: registerBody.email })
        .expect(200);

      expect(emails.sent).toHaveLength(2);
      const resetEmail = emails.sent[1]!;
      expect(resetEmail.subject).toContain('Reset');
      expect(resetEmail.text).toContain('expires in 1 hour');
      expect(resetEmail.text).not.toContain('correct-horse');
    });

    it('resets the password end-to-end and invalidates previous credentials and sessions', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      const verifyToken = verificationTokenFromLatestEmail();
      await request(await app())
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken })
        .expect(200);

      const loginRes = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      const oldRefreshToken = loginRes.body.data.tokens.refreshToken as string;

      await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: registerBody.email })
        .expect(200);
      const resetToken = verificationTokenFromLatestEmail();

      const reset = await request(await app())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'new-password-42' });
      expect(reset.status).toBe(200);

      // Old password rejected, new password works.
      const oldLogin = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: registerBody.password });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(await app())
        .post('/api/v1/auth/login')
        .send({ email: registerBody.email, password: 'new-password-42' });
      expect(newLogin.status).toBe(200);

      // Sessions held before the reset are dead.
      const staleRefresh = await request(await app())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });
      expect(staleRefresh.status).toBe(401);
    });

    it('rejects an invalid reset token', async () => {
      const res = await request(await app())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'garbage', password: 'new-password-42' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('invalid or has expired');
    });

    it('rejects an expired reset token', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: registerBody.email })
        .expect(200);
      const resetToken = verificationTokenFromLatestEmail();

      await db
        .update(schema.passwordResetTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .execute();

      const res = await request(await app())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'new-password-42' });
      expect(res.status).toBe(400);
    });

    it('rejects a reused reset token — single use', async () => {
      await request(await app())
        .post('/api/v1/auth/register')
        .send(registerBody)
        .expect(201);
      await request(await app())
        .post('/api/v1/auth/forgot-password')
        .send({ email: registerBody.email })
        .expect(200);
      const resetToken = verificationTokenFromLatestEmail();

      await request(await app())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'new-password-42' })
        .expect(200);
      const replay = await request(await app())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'another-password' });
      expect(replay.status).toBe(400);
    });

    it('enforces the forgot-password rate limit', async () => {
      const testApp = await app();
      for (let i = 0; i < 5; i += 1) {
        const res = await request(testApp)
          .post('/api/v1/auth/forgot-password')
          .send({ email: 'nobody@example.com' });
        expect(res.status).toBe(200);
      }
      const blocked = await request(testApp)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });
      expect(blocked.status).toBe(429);
    });
  });
});
