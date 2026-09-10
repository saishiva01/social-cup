import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';

import { ForbiddenError } from '../errors/AppError.js';

/**
 * Gates every `/api/v1/admin/*` route on the caller's `users.role` (Phase 6,
 * PRD Module 9). Must run after `requireAuth()` — it reads `req.auth.userId`,
 * the verified access-token identity, never anything client-supplied.
 *
 * Deliberately re-checked from the database on every request, the same
 * choice `requireMembership` already makes (`apps/api/src/domain/entitlements.ts`)
 * and for the same reason: role is not embedded in the JWT, so revoking an
 * admin's access takes effect on their very next request instead of waiting
 * out the access token's 15-minute lifetime. A Visitor or Member — including
 * one with an otherwise perfectly valid access token — gets a 403, not a
 * 401, since they *are* authenticated, just not authorized for this
 * resource; a request with no/invalid token never reaches here at all
 * (requireAuth() already returned 401).
 */
export function requireAdmin(db: DB): RequestHandler {
  return (req, _res, next) => {
    db.select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, req.auth!.userId))
      .then(([row]) => {
        if (row?.role !== 'admin') {
          next(new ForbiddenError('This action requires administrator access'));
          return;
        }
        next();
      })
      .catch(next);
  };
}
