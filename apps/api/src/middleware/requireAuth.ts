import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../lib/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The verified identity from the access token, attached by requireAuth.
       * Present on every request that passed the middleware — the server-side
       * authenticated identity, never anything the client supplied.
       */
      auth?: { userId: string; email: string };
    }
  }
}

/**
 * Verifies the Bearer access token and attaches the identity to req.auth.
 * Deliberately stateless (ADR-0004): no database round-trip per request —
 * the token is verified locally and the refresh-token table is only touched
 * at login/refresh/logout. Deleted accounts are caught at the next refresh
 * (their token rows cascade away) rather than on every request.
 */
export function requireAuth(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(new UnauthorizedError());
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      next(new UnauthorizedError('Invalid or expired access token'));
      return;
    }

    req.auth = { userId: payload.sub, email: payload.email };
    next();
  };
}
