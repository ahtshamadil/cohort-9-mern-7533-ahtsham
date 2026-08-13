import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/** Sends a 404 for any request that did not match a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

/** Turns an error into a response. */
// express only treats this as an error handler if it has all 4 params
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // an HttpError is one a route meant to return, so its message is safe to send
  if (err instanceof HttpError && err.statusCode < 500) {
    logger.debug(
      { statusCode: err.statusCode, method: req.method, url: req.originalUrl },
      err.message,
    );

    res.status(err.statusCode).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');

  res.status(500).json({
    error: { message: 'Something went wrong' },
  });
}
