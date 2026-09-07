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
