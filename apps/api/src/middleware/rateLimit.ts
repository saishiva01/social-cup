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

interface AuthLimiterOptions {
  windowMs: number;
  limit: number;
}

/**
 * Endpoint-specific limiters for the security-sensitive auth routes. Limits
 * are deliberately generous enough not to break normal development/testing
 * (the instructions in docs/architecture/authentication.md are explicit
 * about not making dev unusable), while still stopping scripted brute
 * force / spam. Same in-memory-store caveat as the general limiter — see
 * docs/decisions/open-questions.md #6 before scaling out.
 */
function authLimiter({ windowMs, limit }: AuthLimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}

/**
 * Endpoint-specific limiters for the security-sensitive auth routes. Limits
 * are deliberately generous enough not to break normal development/testing
 * (docs/architecture/authentication.md is explicit about not making dev
 * unusable), while still stopping scripted brute force / spam. Same
 * in-memory-store caveat as the general limiter — see
 * docs/decisions/open-questions.md #6 before scaling out.
 *
 * Each is a factory, not a shared instance: express-rate-limit keeps its
 * counters on the middleware instance, so a module-level singleton would
 * share counters across every createApp() call (all test apps in one
 * process, for example).
 */
export function registerRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }); // account creation
}

export function loginRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }); // credential brute force
}

export function resendVerificationRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 5 }); // verification-email spam
}

export function forgotPasswordRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 5 }); // reset-email spam
}

export function resetPasswordRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }); // reset-link guessing
}

export function refreshRateLimit() {
  return authLimiter({ windowMs: 15 * 60 * 1000, limit: 60 }); // legit clients refresh ~every 15 min
}
