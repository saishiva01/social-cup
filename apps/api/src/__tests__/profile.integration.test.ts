import { schema } from '@social-cup/database';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractTokenFromUrl,
  setupTestDatabase,
  TEST_DATABASE_URL,
  truncateAll,
} from './helpers/db.js';
import { makeTestApp, RecordingEmailService } from './helpers/app.js';

const skip = !TEST_DATABASE_URL;

vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
vi.stubEnv('STRIPE_PRICE_ID', 'price_test_fake');

describe.skipIf(skip)('profile and authorization (real Postgres)', () => {
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

  /** Registers + verifies + logs in, returning the access token and user. */
  async function authenticatedUser(email = 'ada@example.com'): Promise<{ accessToken: string }> {
    const registerBody = { email, password: 'correct-horse', displayName: 'Ada Lovelace' };
    await request(await app())
      .post('/api/v1/auth/register')
      .send(registerBody)
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const match = latest.text.match(/https?:\/\/\S+|socialcup:\/\/\S+/);
    const token = extractTokenFromUrl(match ? match[0] : '');
    await request(await app())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);
    const login = await request(await app())
      .post('/api/v1/auth/login')
      .send({ email, password: registerBody.password });
    return { accessToken: login.body.data.tokens.accessToken as string };
  }

  describe('GET /me', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await request(await app()).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a malformed access token', async () => {
      const res = await request(await app())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('returns the safe profile for an authenticated Visitor', async () => {
      const { accessToken } = await authenticatedUser();

      const res = await request(await app())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        profilePhotoUrl: null,
        coffeePreferences: [],
        neighborhood: null,
        emailVerified: true,
        role: 'user',
      });
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('password_hash');
    });
  });

  describe('PATCH /me', () => {
    it('updates the editable profile fields', async () => {
      const { accessToken } = await authenticatedUser();

      const res = await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          displayName: 'Ada K. Lovelace',
          coffeePreferences: ['espresso', 'latte'],
          neighborhood: 'Bishop Arts District',
          profilePhotoUrl: 'https://example.com/photo.jpg',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Ada K. Lovelace');
      expect(res.body.data.coffeePreferences).toEqual(['espresso', 'latte']);
      expect(res.body.data.neighborhood).toBe('Bishop Arts District');
      expect(res.body.data.profilePhotoUrl).toBe('https://example.com/photo.jpg');
      expect(res.body.data.email).toBe('ada@example.com');
    });

    it('validates coffee preferences against the PRD values', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ coffeePreferences: ['pumpkin-spice'] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty update', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('ignores attempts to modify server-controlled fields', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          displayName: 'Hacked Name',
          email: 'hacked@example.com',
          passwordHash: 'letmein',
          emailVerifiedAt: new Date(0).toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Hacked Name');
      expect(res.body.data.email).toBe('ada@example.com');
      expect(res.body.data.emailVerified).toBe(true);

      const user = (await db.select().from(schema.users))[0]!;
      expect(user.email).toBe('ada@example.com');
      expect(user.passwordHash).not.toBe('letmein');
    });

    it('does not let a user modify another account', async () => {
      const { accessToken } = await authenticatedUser();
      const { accessToken: otherToken } = await authenticatedUser('grace@example.com');

      // ada's token can only ever address ada's row — no user id in the body.
      const res = await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ displayName: 'Ada Two' });
      expect(res.status).toBe(200);

      const other = await request(await app())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(other.body.data.displayName).toBe('Ada Lovelace');
    });
  });

  describe('authorization boundaries', () => {
    it('accepts an authenticated Visitor (no membership gate on ordinary access)', async () => {
      const { accessToken } = await authenticatedUser();
      // Visitor == authenticated user without membership entitlement; ordinary
      // profile access must work for them (ADR-0008).
      const res = await request(await app())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });
  });
});
