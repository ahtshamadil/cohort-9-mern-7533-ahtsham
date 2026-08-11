import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/** Sends a 404 for any request that did not match a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

/**
 * Turns a thrown error into a response.
 *
 * An HttpError is something a route meant to return - a bad request, a failed
 * login - so its message is written for the client and goes back as it is.
 * Anything else is a fault nobody planned for, and its message could name a
 * table or a file path, so it is logged in full and answered with a generic 500.
 */
// express only treats this as an error handler if it has all 4 params
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError && err.statusCode < 500) {
    // debug, not error: a rejected login is the API working, not breaking, and
    // logging it at error level would bury the failures that do need attention
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
