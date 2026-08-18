import type { ZodType } from 'zod';

import { HttpError } from './httpError.js';

/** Parses a value against a schema, or throws a 400 listing what was wrong. */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    throw new HttpError(400, 'Validation failed', details);
  }

  return result.data;
}
