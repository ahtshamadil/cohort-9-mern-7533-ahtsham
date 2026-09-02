import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import { isTest } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const windowMs = 15 * 60 * 1000;

// the suite signs in hundreds of times in a few seconds, so the real limits
// would trip on ordinary tests. the limiter itself is still tested, by building
// one with createLimiter.
const testLimit = 1_000_000;

/** Builds a limiter that answers 429 through the usual error envelope. */
export function createLimiter(limit: number, message: string, name: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      logger.warn({ ip: req.ip, route: name }, 'Rate limit reached');
      next(new HttpError(429, message));
    },
  });
}

function limiter(limit: number, message: string, name: string): RequestHandler {
  return createLimiter(isTest ? testLimit : limit, message, name);
}

/** Guards the credential routes, where a wrong answer is worth retrying. */
export const authLimiter = limiter(
  10,
  'Too many attempts. Wait a few minutes and try again.',
  'auth',
);

/** Guards sharing, which tells the caller whether an address has an account. */
export const shareLimiter = limiter(
  20,
  'Too many sharing attempts. Wait a few minutes and try again.',
  'share',
);

/** A ceiling for everything else, well above what the app itself needs. */
export const apiLimiter = limiter(300, 'Too many requests. Slow down and try again.', 'api');
