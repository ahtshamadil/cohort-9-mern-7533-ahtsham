import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

// naming the algorithm in both directions rather than taking the library's
// default. the header of a token is written by whoever sends it, so a verifier
// that accepts whatever the header claims is letting the caller pick - which is
// how the classic forgery works when the key is asymmetric and an attacker
// downgrades RS256 to HS256 to sign with the public key
const ALGORITHM = 'HS256';

/** Signs a session token identifying the user. */
export function signToken(userId: number): string {
  // `subject` is the standard claim for who a token is about, so the id goes
  // there rather than into a field of our own invention
  return jwt.sign({}, env.jwtSecret, {
    algorithm: ALGORITHM,
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
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });

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
