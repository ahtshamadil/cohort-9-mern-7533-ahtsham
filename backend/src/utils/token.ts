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

/** Who a token is for, and the moment it stops being valid. */
export interface Session {
  userId: number;
  expiresAt: number;
}

/** Returns the session a valid token carries, or null if it is not valid. */
export function verifySession(token: string): Session | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });

    if (typeof payload === 'string' || payload.sub === undefined || payload.exp === undefined) {
      return null;
    }

    const userId = Number(payload.sub);

    return Number.isInteger(userId) ? { userId, expiresAt: payload.exp * 1000 } : null;
  } catch {
    return null;
  }
}

/** Returns the user id from a valid token, or null if it is not valid. */
export function verifyToken(token: string): number | null {
  return verifySession(token)?.userId ?? null;
}
