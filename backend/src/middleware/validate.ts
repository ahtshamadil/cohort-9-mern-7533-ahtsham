import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { parseOrThrow } from '../utils/validation.js';

/** Checks the request body against a schema before the route runs. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = parseOrThrow(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
