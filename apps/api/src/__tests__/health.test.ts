import type { createApp } from '../app.js';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
vi.stubEnv('STRIPE_PRICE_ID', 'price_test_fake');

/**
 * A callable fake mimicking postgres.js's Sql tagged-template client. It
 * must also carry .options.{parsers,serializers} — createApp builds the
 * Drizzle handle eagerly and drizzle's postgres-js driver mutates those
 * maps at construction time.
 */
function makeFakeSqlClient(
  impl: () => Promise<unknown>,
): Parameters<typeof createApp>[0]['client'] {
  const client = impl as unknown as Parameters<typeof createApp>[0]['client'];
  (client as unknown as { options: Record<string, Record<string, unknown>> }).options = {
    parsers: {},
    serializers: {},
  };
  return client;
}

describe('GET /health', () => {
  let app: Express;

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    // A stand-in for the postgres.Sql client — /health (liveness) never
    // calls it; /health/ready is covered separately below with a
    // callable fake that mimics postgres.js's tagged-template client.
    // `.options` is required because createApp now builds the Drizzle handle
    // eagerly and drizzle's postgres-js driver mutates client.options.
    const fakeClient = makeFakeSqlClient(async () => Promise.resolve([{ '?column?': 1 }]));
    app = createApp({ client: fakeClient });
  });

  it('returns 200 and an ok status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('echoes a correlation id header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('GET /health/ready', () => {
  let createAppFn: typeof createApp;

  beforeAll(async () => {
    ({ createApp: createAppFn } = await import('../app.js'));
  });

  it('returns 200 when the database responds', async () => {
    const app = createAppFn({
      client: makeFakeSqlClient(async () => Promise.resolve([{ '?column?': 1 }])),
    });

    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('returns 503 with a non-empty reason when the connection is refused', async () => {
    // Reproduces postgres.js's actual shape for a refused connection: an
    // AggregateError whose .message is "" and whose useful detail is on
    // .code — the most common local-dev readiness failure (DB not running).
    const connectionRefused = Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' });
    const app = createAppFn({ client: makeFakeSqlClient(() => Promise.reject(connectionRefused)) });

    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.reason).toBeTruthy();
    expect(response.body.reason).toContain('ECONNREFUSED');
  });
});

describe('GET /unknown-route', () => {
  let app: Express;

  beforeAll(async () => {
    const { createApp } = await import('../app.js');
    const fakeClient = makeFakeSqlClient(async () => Promise.resolve([{ '?column?': 1 }]));
    app = createApp({ client: fakeClient });
  });

  it('returns a well-formed 404 error envelope', async () => {
    const response = await request(app).get('/unknown-route');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(response.body.meta.requestId).toBeTruthy();
  });
});
