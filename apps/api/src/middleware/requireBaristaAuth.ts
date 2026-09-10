import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { UnauthorizedError } from '../errors/AppError.js';
import { BARISTA_DEVICE_COOKIE_NAME } from '../lib/baristaCookie.js';
import type { BaristaService } from '../services/baristaService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The cafe/device a barista session was authenticated for, attached by
       * requireBaristaAuth. Derived entirely from the trusted-device cookie
       * — never from a cafeId the browser might supply in a body/query, so
       * a barista can never redeem against a cafe other than the one they
       * authenticated to (PRD Module 8).
       */
      barista?: { cafeId: string; deviceId: string };
    }
  }
}

/**
 * Verifies the httpOnly trusted-device cookie set by POST
 * /barista/authenticate. Separate from requireAuth()/req.auth entirely — a
 * barista has no Social Cup account, no access/refresh token pair (see
 * docs/architecture/authentication.md, "Barista access is a separate model
 * entirely").
 */
export function requireBaristaAuth(baristaService: BaristaService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const rawToken = req.cookies?.[BARISTA_DEVICE_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      next(new UnauthorizedError('Session expired'));
      return;
    }

    baristaService
      .validateDeviceToken(rawToken)
      .then((device) => {
        if (!device) {
          next(new UnauthorizedError('Session expired'));
          return;
        }
        req.barista = device;
        next();
      })
      .catch(next);
  };
}
