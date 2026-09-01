import type { NextFunction, Request, Response } from 'express';

import { sessionIsCurrent } from '../services/authService.js';
import { AUTH_COOKIE } from '../utils/authCookie.js';
import { HttpError } from '../utils/httpError.js';
import { readToken } from '../utils/token.js';

/** Blocks the request unless it has a valid, current session cookie. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const rejection = new HttpError(401, 'Authentication required');

  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (token === undefined) {
    next(rejection);
    return;
  }

  const session = readToken(token);
  if (session === null) {
    next(rejection);
    return;
  }

  // the signature only proves the token was issued, not that it still stands.
  // this is the read that makes changing a password end the other sessions
  try {
    if (!(await sessionIsCurrent(session))) {
      next(rejection);
      return;
    }
  } catch (error) {
    next(error);
    return;
  }

  req.userId = session.userId;
  next();
}

/** The id requireAuth put on the request. */
export function currentUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new HttpError(401, 'Authentication required');
  }

  return req.userId;
}
