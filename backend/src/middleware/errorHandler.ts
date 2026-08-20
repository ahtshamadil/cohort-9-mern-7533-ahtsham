import type { NextFunction, Request, Response } from 'express';

import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/** Sends a 404 for any request that did not match a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

const bodyParserMessages: Record<string, string> = {
  'entity.parse.failed': 'Request body is not valid JSON',
  'entity.too.large': 'Request body is too large',
  'charset.unsupported': 'Request body uses a character set the server cannot read',
  'encoding.unsupported': 'Request body uses an encoding the server cannot read',
  'request.aborted': 'Request body was not sent in full',
  'request.size.invalid': 'Request body was not the length it claimed',
};

/** What to answer an error thrown by the body parser with, if it is one. */
function bodyParserFailure(err: Error): { status: number; message: string } | null {
  const { status, statusCode, type } = err as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };
  const code = typeof status === 'number' ? status : statusCode;

  if (typeof code !== 'number' || code < 400 || code >= 500) {
    return null;
  }

  // the type says what went wrong; the status alone does not tell 400s apart
  const message = typeof type === 'string' ? bodyParserMessages[type] : undefined;

  return { status: code, message: message ?? 'Request body could not be read' };
}

/** Turns an error into a response. */
// express only treats this as an error handler if it has all 4 params
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // a streamed response is already partly sent, so there is no status left to
  // set. cutting the connection is what tells the client the file is unfinished
  if (res.headersSent) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Response failed part way');
    res.destroy();
    return;
  }

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

  // an unreadable body reaches here rather than a route, and is the sender's mistake
  const failure = bodyParserFailure(err);

  if (failure !== null) {
    logger.debug(
      { statusCode: failure.status, method: req.method, url: req.originalUrl },
      err.message,
    );

    res.status(failure.status).json({ error: { message: failure.message } });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');

  res.status(500).json({
    error: { message: 'Something went wrong' },
  });
}
