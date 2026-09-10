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

describe.skipIf(skip)('cafe discovery (real Postgres)', () => {
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

  async function authenticatedUser(
    overrides: { coffeePreferences?: string[] } = {},
  ): Promise<{ accessToken: string; userId: string }> {
    const email = 'ada@example.com';
    await request(await app())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', displayName: 'Ada Lovelace' })
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
    const accessToken = login.body.data.tokens.accessToken as string;
    const userId = login.body.data.user.id as string;

    if (overrides.coffeePreferences) {
      await request(await app())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ coffeePreferences: overrides.coffeePreferences });
    }

    return { accessToken, userId };
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
        photos: ['https://example.com/cover.jpg'],
        vibeTags: ['Good for remote work'],
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
    it('rejects an unauthenticated request on every route', async () => {
      const routes = [
        '/api/v1/cafes',
        '/api/v1/cafes/featured',
        '/api/v1/cafes/signature-drinks',
        '/api/v1/cafes/neighborhoods',
      ];
      for (const route of routes) {
        const res = await request(await app()).get(route);
        expect(res.status).toBe(401);
      }
    });

    it('lets an authenticated Visitor (no membership) browse every route', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();

      for (const route of [
        '/api/v1/cafes',
        '/api/v1/cafes/featured',
        '/api/v1/cafes/signature-drinks',
        '/api/v1/cafes/neighborhoods',
        `/api/v1/cafes/${cafeId}`,
      ]) {
        const res = await request(await app())
          .get(route)
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /cafes', () => {
    it('returns an empty page when there are no cafes', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .get('/api/v1/cafes')
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

    it('filters by search and by neighborhood', async () => {
      const { accessToken } = await authenticatedUser();
      await seedCafe({ name: 'Blackwood Roasting Co.', neighborhood: 'Bishop Arts District' });
      await seedCafe({ name: 'Uptown Press', neighborhood: 'Uptown' });

      const bySearch = await request(await app())
        .get('/api/v1/cafes?search=uptown')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(bySearch.body.data.items).toHaveLength(1);
      expect(bySearch.body.data.items[0].name).toBe('Uptown Press');

      const byNeighborhood = await request(await app())
        .get('/api/v1/cafes?neighborhood=Uptown')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(byNeighborhood.body.data.items).toHaveLength(1);
      expect(byNeighborhood.body.data.items[0].name).toBe('Uptown Press');
    });

    it('paginates results', async () => {
      const { accessToken } = await authenticatedUser();
      for (let i = 0; i < 3; i += 1) {
        await seedCafe({ name: `Cafe ${i}`, neighborhood: 'Uptown' });
      }

      const res = await request(await app())
        .get('/api/v1/cafes?page=1&pageSize=2')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.totalItems).toBe(3);
      expect(res.body.data.totalPages).toBe(2);
    });

    it('orders nearest-first when lat/lng are given', async () => {
      const { accessToken } = await authenticatedUser();
      // Far cafe (Fort Worth-ish) vs. near cafe, relative to a Dallas point.
      await seedCafe({ name: 'Far Cafe', latitude: '32.7555', longitude: '-97.3308' });
      await seedCafe({ name: 'Near Cafe', latitude: '32.7480', longitude: '-96.8290' });

      const res = await request(await app())
        .get('/api/v1/cafes?lat=32.7477&lng=-96.8288')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.body.data.items[0].name).toBe('Near Cafe');
      expect(res.body.data.items[0].distanceMiles).toBeLessThan(
        res.body.data.items[1].distanceMiles,
      );
    });

    it('surfaces the lowest active drink credit price on the card', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      await seedDrink(cafeId, { name: 'Pricey Latte', creditPrice: 8 });
      await seedDrink(cafeId, { name: 'Cheap Drip', creditPrice: 3 });
      await seedDrink(cafeId, { name: 'Hidden Drink', creditPrice: 1, isActive: false });

      const res = await request(await app())
        .get('/api/v1/cafes')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.body.data.items[0].lowestCreditPrice).toBe(3);
    });

    it('rejects an invalid page number', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .get('/api/v1/cafes?page=0')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an out-of-range latitude', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .get('/api/v1/cafes?lat=999&lng=0')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /cafes/featured', () => {
    it('orders featured first, then a matching coffee preference, then the rest', async () => {
      const { accessToken } = await authenticatedUser({ coffeePreferences: ['matcha'] });

      const plainCafe = await seedCafe({ name: 'Plain Cafe', neighborhood: 'A' });
      await seedDrink(plainCafe, { category: 'espresso' });

      const matchingCafe = await seedCafe({ name: 'Matcha Cafe', neighborhood: 'B' });
      await seedDrink(matchingCafe, { category: 'matcha' });

      const featuredCafe = await seedCafe({
        name: 'Featured Cafe',
        neighborhood: 'C',
        featured: true,
      });
      await seedDrink(featuredCafe, { category: 'espresso' });

      const res = await request(await app())
        .get('/api/v1/cafes/featured')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      const names = res.body.data.map((item: { name: string }) => item.name);
      expect(names).toEqual(['Featured Cafe', 'Matcha Cafe', 'Plain Cafe']);
    });
  });

  describe('GET /cafes/signature-drinks', () => {
    it('only returns active, signature-flagged drinks', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      await seedDrink(cafeId, { name: 'Signature Latte', signature: true });
      await seedDrink(cafeId, { name: 'Inactive Signature', signature: true, isActive: false });
      await seedDrink(cafeId, { name: 'Regular Drink', signature: false });

      const res = await request(await app())
        .get('/api/v1/cafes/signature-drinks')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Signature Latte');
      expect(res.body.data[0].cafeName).toBe('Blackwood Roasting Co.');
    });
  });

  describe('GET /cafes/neighborhoods', () => {
    it('returns the distinct neighborhoods actually present in the data', async () => {
      const { accessToken } = await authenticatedUser();
      await seedCafe({ neighborhood: 'Uptown' });
      await seedCafe({ neighborhood: 'Uptown' });
      await seedCafe({ neighborhood: 'Deep Ellum' });

      const res = await request(await app())
        .get('/api/v1/cafes/neighborhoods')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(['Deep Ellum', 'Uptown']);
    });
  });

  describe('GET /cafes/:id', () => {
    it('returns the cafe and its active menu', async () => {
      const { accessToken } = await authenticatedUser();
      const cafeId = await seedCafe();
      await seedDrink(cafeId, { name: 'Visible Drink' });
      await seedDrink(cafeId, { name: 'Hidden Drink', isActive: false });

      const res = await request(await app())
        .get(`/api/v1/cafes/${cafeId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.cafe.id).toBe(cafeId);
      expect(res.body.data.drinks).toHaveLength(1);
      expect(res.body.data.drinks[0].name).toBe('Visible Drink');
    });

    it('returns 404 for a cafe that does not exist', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .get('/api/v1/cafes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('returns a validation error for a malformed id', async () => {
      const { accessToken } = await authenticatedUser();
      const res = await request(await app())
        .get('/api/v1/cafes/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });
  });
});
