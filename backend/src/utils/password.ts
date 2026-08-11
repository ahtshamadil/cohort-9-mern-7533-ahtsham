import bcrypt from 'bcrypt';

import { isTest } from '../config/env.js';

// bcrypt is deliberately slow, which is the whole point when it guards a
// password but a problem for a suite that hashes in nearly every test. 12 is
// the cost that ships; tests drop to the cheapest bcrypt accepts.
const COST = isTest ? 4 : 12;

/** Hashes a plain password for storage. The salt is generated per call. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/** True if the plain password matches the stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
