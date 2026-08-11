import type { CookieOptions, Response } from 'express';

import { env } from '../config/env.js';

/** Name of the cookie carrying the session token. */
export const AUTH_COOKIE = 'token';

// a cookie is only cleared if the attributes match the ones it was set with, so
// both helpers below build from this one object rather than repeating themselves
const baseOptions: CookieOptions = {
  // the browser will not hand this to javascript, so an injected script cannot
  // read the session out of the page the way it could read local storage
  httpOnly: true,
  // lax still sends the cookie when someone follows a link to the site, but not
  // on a cross-site form post, which is the request csrf actually needs
  sameSite: 'lax',
  // a secure cookie is dropped over plain http, which is what localhost serves
  secure: env.nodeEnv === 'production',
  path: '/',
};

/** Sets the session cookie carrying the signed token. */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    ...baseOptions,
    maxAge: env.jwtExpiresInSeconds * 1000,
  });
}

/** Removes the session cookie. */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseOptions);
}
