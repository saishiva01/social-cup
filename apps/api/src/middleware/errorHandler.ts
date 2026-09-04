import type { ApiErrorResponse } from '@social-cup/types';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/AppError.js';
import { logger } from '../lib/logger.js';

function zodErrorToDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '(root)';
    details[path] ??= [];
    details[path].push(issue.message);
  }
  return details;
}

/** Express 4 signature — the 4-arg arity is what makes this an error handler. */
export function errorHandler() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.requestId;

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error({ err, requestId }, 'Request failed with server error');
      } else {
        logger.warn({ err: err.message, code: err.code, requestId }, 'Request failed');
      }

      const body: ApiErrorResponse = {
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
        meta: { requestId },
      };
      res.status(err.statusCode).json(body);
      return;
    }

    if (err instanceof ZodError) {
      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: zodErrorToDetails(err),
        },
        meta: { requestId },
      };
      res.status(400).json(body);
      return;
    }

    // Unexpected error: log full detail server-side, never leak internals.
    logger.error({ err, requestId }, 'Unhandled error');
    const body: ApiErrorResponse = {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
      meta: { requestId },
    };
    res.status(500).json(body);
  };
}
