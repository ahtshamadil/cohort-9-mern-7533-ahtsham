import type { CookieOptions, Response } from 'express';

import { env } from '../config/env.js';

/** Name of the cookie holding the session token. */
export const AUTH_COOKIE = 'token';

// clearing a cookie only works if the options match the ones it was set with
const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.nodeEnv === 'production',
  path: '/',
};

/** Sets the session cookie. */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    ...baseOptions,
    maxAge: env.jwtExpiresInSeconds * 1000,
  });
}

/** Clears the session cookie. */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseOptions);
}
