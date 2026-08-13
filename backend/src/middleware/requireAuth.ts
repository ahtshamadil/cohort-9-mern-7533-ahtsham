import type { NextFunction, Request, Response } from 'express';

import { AUTH_COOKIE } from '../utils/authCookie.js';
import { HttpError } from '../utils/httpError.js';
import { verifyToken } from '../utils/token.js';

/** Blocks the request unless it has a valid session cookie. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
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
