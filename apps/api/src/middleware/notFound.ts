import type { NextFunction, Request, Response } from 'express';

import { NotFoundError } from '../errors/AppError.js';

export function notFound() {
  return (req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
  };
}
