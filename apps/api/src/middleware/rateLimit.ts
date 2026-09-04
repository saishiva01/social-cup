import { rateLimit } from 'express-rate-limit';

import { TooManyRequestsError } from '../errors/AppError.js';

/**
 * Rate limiting foundation. Uses express-rate-limit's default in-memory
 * store, which is correct for a single process but does NOT share state
 * across multiple ECS/Fargate tasks — see
 * docs/decisions/open-questions.md ("Rate limit store for multi-instance
 * deployment") before this is relied on in staging/production with more
 * than one task running.
 *
 * `general` is mounted globally; stricter, endpoint-specific limiters
 * (login, password reset, redemption) should be added alongside the routes
 * they protect once those routes exist.
 */
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError());
  },
});
