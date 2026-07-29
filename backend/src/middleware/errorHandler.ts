import type { NextFunction, Request, Response } from 'express';

import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

// express only treats this as an error handler if it has all 4 params
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');

  res.status(500).json({
    error: { message: 'Something went wrong' },
  });
}
