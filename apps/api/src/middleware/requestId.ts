import { generateId } from '@social-cup/utils';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Correlation id for every request. Reuses an inbound X-Request-Id (e.g. from
 * an ALB or upstream service) when present so traces stay linked across
 * hops; otherwise generates a fresh one. Echoed back on the response header
 * and included in every log line and error response for this request.
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const inbound = req.header(REQUEST_ID_HEADER);
    req.requestId = inbound && inbound.length > 0 ? inbound : generateId();
    res.setHeader(REQUEST_ID_HEADER, req.requestId);
    next();
  };
}
