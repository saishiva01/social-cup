import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '../errors/AppError.js';
import { getAccountState, requireMembership } from '../domain/entitlements.js';

describe('entitlements (ADR-0008 seam)', () => {
  it('resolves every account to visitor until Phase 4 introduces memberships', async () => {
    await expect(getAccountState('any-user-id')).resolves.toBe('visitor');
  });

  it('blocks membership-gated routes for a Visitor with a ForbiddenError', async () => {
    const middleware = requireMembership();
    const req = { auth: { userId: 'u-1', email: 'ada@example.com' } } as unknown as Request;

    const result = await new Promise<unknown>((resolve) => {
      middleware(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });

    expect(result).toBeInstanceOf(ForbiddenError);
  });
});
