import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

/**
 * Parses and replaces req.body with the validated value. A ZodError passes
 * through to the central error handler, which turns it into a 400
 * VALIDATION_ERROR envelope with per-field details.
 */
export function validateBody<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Parses req.query (e.g. search/filter/pagination params) and attaches the
 * validated, coerced value as req.validatedQuery — req.query itself is a
 * getter-only object on modern Express types, so it cannot be reassigned the
 * way validateBody reassigns req.body.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

export function validateQuery<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };
}
