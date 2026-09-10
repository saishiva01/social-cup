import { schema } from '@social-cup/database';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ForbiddenError } from '../errors/AppError.js';
import { getAccountState, requireMembership } from '../domain/entitlements.js';
import { setupTestDatabase, TEST_DATABASE_URL, truncateAll } from './helpers/db.js';

/**
 * The ADR-0008 Visitor/Member seam, now backed by the real memberships table
 * (Phase 4). Needs a real Postgres instance like the other *.integration.test.ts
 * suites — see docs/development/testing-strategy.md.
 */
const skip = !TEST_DATABASE_URL;

describe.skipIf(skip)('entitlements (ADR-0008 seam, Phase 4)', () => {
  let client: Awaited<ReturnType<typeof setupTestDatabase>>['client'];
  let db: Awaited<ReturnType<typeof setupTestDatabase>>['db'];
  let close: Awaited<ReturnType<typeof setupTestDatabase>>['close'];

  beforeAll(async () => {
    ({ client, db, close } = await setupTestDatabase(TEST_DATABASE_URL!));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(client);
  });

  async function createUser(): Promise<string> {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `ada-${Date.now()}-${Math.random()}@example.com`,
        passwordHash: 'x',
        displayName: 'Ada',
      })
      .returning({ id: schema.users.id });
    return user!.id;
  }

  it('resolves a user with no membership row to visitor', async () => {
    const userId = await createUser();
    await expect(getAccountState(db, userId)).resolves.toBe('visitor');
  });

  it('resolves a user with a non-active membership row to visitor', async () => {
    const userId = await createUser();
    await db.insert(schema.memberships).values({
      userId,
      stripeCustomerId: 'cus_test_1',
      status: 'past_due',
    });
    await expect(getAccountState(db, userId)).resolves.toBe('visitor');
  });

  it('resolves a user with an active membership row to member', async () => {
    const userId = await createUser();
    await db.insert(schema.memberships).values({
      userId,
      stripeCustomerId: 'cus_test_2',
      status: 'active',
    });
    await expect(getAccountState(db, userId)).resolves.toBe('member');
  });

  it('blocks membership-gated routes for a Visitor with a ForbiddenError', async () => {
    const userId = await createUser();
    const middleware = requireMembership(db);
    const req = { auth: { userId, email: 'ada@example.com' } } as unknown as Request;

    const result = await new Promise<unknown>((resolve) => {
      middleware(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });

    expect(result).toBeInstanceOf(ForbiddenError);
  });

  it('allows membership-gated routes for a Member', async () => {
    const userId = await createUser();
    await db.insert(schema.memberships).values({
      userId,
      stripeCustomerId: 'cus_test_3',
      status: 'active',
    });
    const middleware = requireMembership(db);
    const req = { auth: { userId, email: 'ada@example.com' } } as unknown as Request;

    const result = await new Promise<unknown>((resolve) => {
      middleware(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });

    expect(result).toBeUndefined();
  });
});
