import bcrypt from 'bcrypt';

import { isTest } from '../config/env.js';

// tests would be slow at the real cost
const COST = isTest ? 4 : 12;

/**
 * The longest password bcrypt actually reads. It ignores everything past this,
 * so without a cap two different passwords sharing a 72 byte prefix both open
 * the same account.
 */
export const maxPasswordBytes = 72;

/** Hashes a password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/** Checks a password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
