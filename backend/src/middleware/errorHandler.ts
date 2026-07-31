import type { NextFunction, Request, Response } from 'express';

import { logger } from '../utils/logger.js';

/** Sends a 404 for any request that did not match a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

/** Logs the error and returns a generic 500 so internals stay hidden from the client. */
// express only treats this as an error handler if it has all 4 params
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');

  res.status(500).json({
    error: { message: 'Something went wrong' },
  });
}
