import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/** Sends a 404 for any request that did not match a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

/** The status on an error thrown by the body parser, if it carries one. */
function bodyParserStatus(err: Error): number | null {
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const code = typeof status === 'number' ? status : statusCode;

  return typeof code === 'number' && code >= 400 && code < 500 ? code : null;
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

  // unreadable json reaches here rather than a route, and is the sender's mistake
  const status = bodyParserStatus(err);

  if (status !== null) {
    logger.debug({ statusCode: status, method: req.method, url: req.originalUrl }, err.message);

    res.status(status).json({
      error: {
        message: status === 413 ? 'Request body is too large' : 'Request body is not valid JSON',
      },
    });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');

  res.status(500).json({
    error: { message: 'Something went wrong' },
  });
}
