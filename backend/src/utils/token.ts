import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

const ALGORITHM = 'HS256';

/** Signs a session token for a user. */
export function signToken(userId: number): string {
  return jwt.sign({}, env.jwtSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: env.jwtExpiresInSeconds,
  });
}

/** Returns the user id from a valid token, or null if it is not valid. */
export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });

    if (typeof payload === 'string' || payload.sub === undefined) {
      return null;
    }

    const userId = Number(payload.sub);

    return Number.isInteger(userId) ? userId : null;
  } catch {
    return null;
  }
}
