import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { HttpError } from '../utils/httpError.js';

/**
 * Checks the request body against a schema before the route runs, so a handler
 * can trust what it receives.
 *
 * The body is replaced with the parsed value, which has been trimmed and had
 * unknown keys dropped, rather than being whatever json arrived.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // one entry per problem, naming the field, which is what a form needs to
      // put the message next to the right input
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      next(new HttpError(400, 'Validation failed', details));
      return;
    }

    req.body = result.data;
    next();
  };
}
