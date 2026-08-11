import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

/** Signs a session token identifying the user. */
export function signToken(userId: number): string {
  // `subject` is the standard claim for who a token is about, so the id goes
  // there rather than into a field of our own invention
  return jwt.sign({}, env.jwtSecret, {
    subject: String(userId),
    expiresIn: env.jwtExpiresInSeconds,
  });
}

/**
 * Returns the user id carried by a valid token, or null if it is expired,
 * tampered with, or signed by anyone but us.
 */
export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret);

    // a token signed with a bare string payload has no claims to read
    if (typeof payload === 'string' || payload.sub === undefined) {
      return null;
    }

    const userId = Number(payload.sub);

    // the signature already proves we issued this, but a subject that is not an
    // id would mean a token from some other purpose, so it still gets rejected
    return Number.isInteger(userId) ? userId : null;
  } catch {
    // jsonwebtoken throws for expiry and for a bad signature alike. neither is
    // worth distinguishing to a caller - both mean "log in again"
    return null;
  }
}
