import type { NextFunction, Request, Response } from 'express';

import { AUTH_COOKIE } from '../utils/authCookie.js';
import { HttpError } from '../utils/httpError.js';
import { verifyToken } from '../utils/token.js';

/**
 * Rejects the request unless it carries a valid session cookie, and records who
 * sent it on the request for the route behind this.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  // one message for a missing cookie and for a bad one. which of the two it was
  // tells a caller nothing they can act on, and the difference is worth nothing
  // to an attacker either
  const rejection = new HttpError(401, 'Authentication required');

  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (token === undefined) {
    next(rejection);
    return;
  }

  const userId = verifyToken(token);
  if (userId === null) {
    next(rejection);
    return;
  }

  req.userId = userId;
  next();
}
