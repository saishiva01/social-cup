import { schema } from '@social-cup/database';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestDatabase, TEST_DATABASE_URL, truncateAll } from './helpers/db.js';
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

describe.skipIf(skip)('drink ratings and diary (real Postgres)', () => {
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

  let userCounter = 0;
  async function authenticatedUser(): Promise<{ accessToken: string; userId: string }> {
    userCounter += 1;
    const email = `user${userCounter}@example.com`;
    await request(await app())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: `User ${userCounter}` })
      .expect(201);
    const latest = emails.sent[emails.sent.length - 1]!;
    const match = latest.text.match(/https?:\/\/\S+|socialcup:\/\/\S+/);
    const token = match ? match[0].split('token=')[1]! : '';
    await request(await app())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);
    const login = await request(await app())
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct-horse' });
    return {
      accessToken: login.body.data.tokens.accessToken as string,
      userId: login.body.data.user.id as string,
    };
  }

  async function seedCafe(fields: Partial<typeof schema.cafes.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.cafes)
      .values({
        name: 'Blackwood Roasting Co.',
        neighborhood: 'Bishop Arts District',
        address: '408 N Bishop Ave, Dallas, TX',
        latitude: '32.7477',
        longitude: '-96.8288',
        photos: [],
        vibeTags: [],
        hours: {},
        ...fields,
      })
      .returning();
    return row!.id;
  }

  async function seedDrink(
    cafeId: string,
    fields: Partial<typeof schema.drinks.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await db
      .insert(schema.drinks)
      .values({
        cafeId,
        name: 'Oat Milk Latte',
        retailPriceCents: 550,
        creditPrice: 5,
        ...fields,
      })
      .returning();
    return row!.id;
  }

  describe('authorization', () => {
    it('rejects unauthenticated requests on every ratings/diary route', async () => {
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const getRating = await request(await app()).get(`/api/v1/drinks/${drinkId}/rating`);
      expect(getRating.status).toBe(401);

      const putRating = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .send({ stars: 5 });
      expect(putRating.status).toBe(401);

      const diary = await request(await app()).get('/api/v1/me/ratings');
      expect(diary.status).toBe(401);
    });
  });

  describe('PUT /drinks/:drinkId/rating', () => {
    it('lets a Visitor (no membership) rate a drink, with an optional note', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const res = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 4, note: 'Great oat milk latte' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ drinkId, stars: 4, note: 'Great oat milk latte' });
    });

    it('allows skipping the note', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const res = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.note).toBeNull();
    });

    it('edits an existing rating instead of creating a second one (one rating per user per drink)', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const first = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 2, note: 'Meh' });
      const second = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5, note: 'Actually great on a second visit' });

      expect(first.body.data.id).toBe(second.body.data.id);
      expect(second.body.data.stars).toBe(5);

      const rows = await db.select().from(schema.ratings);
      const drinkRatings = rows.filter((row) => row.drinkId === drinkId);
      expect(drinkRatings).toHaveLength(1);
    });

    it('rejects an out-of-range star value', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const res = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 6 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a note longer than 140 characters', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const res = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5, note: 'x'.repeat(141) });

      expect(res.status).toBe(400);
    });

    it('returns 404 for a nonexistent drink', async () => {
      const { accessToken } = await authenticatedUser();

      const res = await request(await app())
        .put('/api/v1/drinks/00000000-0000-0000-0000-000000000000/rating')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5 });

      expect(res.status).toBe(404);
    });

    it('returns 404 for an inactive (hidden) drink', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId, { isActive: false });

      const res = await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5 });

      expect(res.status).toBe(404);
    });

    it('returns a validation error for a malformed drink id', async () => {
      const { accessToken } = await authenticatedUser();

      const res = await request(await app())
        .put('/api/v1/drinks/not-a-uuid/rating')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /drinks/:drinkId/rating', () => {
    it('returns null when the caller has not rated the drink', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      const res = await request(await app())
        .get(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it("never returns another user's rating for the same drink", async () => {
      const userA = await authenticatedUser();
      const userB = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ stars: 5, note: "A's private note" });

      const res = await request(await app())
        .get(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  describe('GET /me/ratings (drink diary)', () => {
    it('returns an empty diary for a user with no ratings', async () => {
      const { accessToken } = await authenticatedUser();

      const res = await request(await app())
        .get('/api/v1/me/ratings')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 1,
      });
    });

    it('lists rated drinks highest-rated first, with drink/cafe/stars/note/date', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe({ name: 'Blackwood Roasting Co.' });
      const lowRatedDrink = await seedDrink(cafeId, { name: 'Drip Coffee' });
      const highRatedDrink = await seedDrink(cafeId, { name: 'Oat Milk Latte' });

      await request(await app())
        .put(`/api/v1/drinks/${lowRatedDrink}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 2 });
      await request(await app())
        .put(`/api/v1/drinks/${highRatedDrink}/rating`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stars: 5, note: 'Perfect' });

      const res = await request(await app())
        .get('/api/v1/me/ratings')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0]).toMatchObject({
        stars: 5,
        note: 'Perfect',
        drink: { name: 'Oat Milk Latte' },
        cafe: { name: 'Blackwood Roasting Co.' },
      });
      expect(res.body.data.items[1]).toMatchObject({ stars: 2 });
    });

    it("never includes another user's ratings", async () => {
      const userA = await authenticatedUser();
      const userB = await authenticatedUser();
      const cafeId = await seedCafe();
      const drinkId = await seedDrink(cafeId);

      await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ stars: 5 });

      const res = await request(await app())
        .get('/api/v1/me/ratings')
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.body.data.items).toHaveLength(0);
    });

    it('paginates diary results', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      for (let i = 0; i < 3; i += 1) {
        const drinkId = await seedDrink(cafeId, { name: `Drink ${i}` });
        await request(await app())
          .put(`/api/v1/drinks/${drinkId}/rating`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ stars: 3 });
      }

      const res = await request(await app())
        .get('/api/v1/me/ratings?page=1&pageSize=2')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.totalItems).toBe(3);
      expect(res.body.data.totalPages).toBe(2);
    });
  });

  describe('cafe/drink aggregate integration', () => {
    it('shows a drink and cafe average rating + count once rated, on the cafe detail and list endpoints', async () => {
      const raterA = await authenticatedUser();
      const raterB = await authenticatedUser();
      const cafeId = await seedCafe({ name: 'Aggregate Cafe' });
      const drinkId = await seedDrink(cafeId, { name: 'Cortado' });

      await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${raterA.accessToken}`)
        .send({ stars: 4 });
      await request(await app())
        .put(`/api/v1/drinks/${drinkId}/rating`)
        .set('Authorization', `Bearer ${raterB.accessToken}`)
        .send({ stars: 2 });

      const detail = await request(await app())
        .get(`/api/v1/cafes/${cafeId}`)
        .set('Authorization', `Bearer ${raterA.accessToken}`);
      expect(detail.body.data.drinks[0]).toMatchObject({ averageRating: 3, ratingCount: 2 });

      const list = await request(await app())
        .get('/api/v1/cafes')
        .set('Authorization', `Bearer ${raterA.accessToken}`);
      expect(list.body.data.items[0]).toMatchObject({
        averageRating: 3,
        ratingCount: 2,
        isNew: false,
      });
    });

    it('shows the "New" badge (isNew, null average) for a cafe with no rated drinks', async () => {
      const { accessToken } = await authenticatedUser();
      await seedCafe({ name: 'Unrated Cafe' });

      const list = await request(await app())
        .get('/api/v1/cafes')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(list.body.data.items[0]).toMatchObject({
        averageRating: null,
        ratingCount: 0,
        isNew: true,
      });
    });
  });
});
