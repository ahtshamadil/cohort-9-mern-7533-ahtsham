import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

const ALGORITHM = 'HS256';

/** What a valid token says: who it is for, and which generation of it. */
export interface Session {
  userId: number;
  tokenVersion: number;
}

/** Signs a session token for a user. */
export function signToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ ver: tokenVersion }, env.jwtSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: env.jwtExpiresInSeconds,
  });
}

/** Reads a valid token, or null if it is not one. */
export function readToken(token: string): Session | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });

    if (typeof payload === 'string' || payload.sub === undefined) {
      return null;
    }

    const userId = Number(payload.sub);
    const { ver } = payload as { ver?: unknown };

    if (!Number.isInteger(userId) || !Number.isInteger(ver)) {
      return null;
    }

    return { userId, tokenVersion: ver as number };
  } catch {
    return null;
  }
}
