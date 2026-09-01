import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { notesRouter } from './routes/notes.js';

/** Builds the express app with middleware and routes wired up. */
export function createApp(): Express {
  const app = express();

  // the api only ever answers json, so it needs none of what a csp normally
  // allows. anything that does try to load from a response here is a mistake
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], sandbox: [] },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // req.ip is what the limiters count by. off unless TRUST_PROXY says how many
  // hops are really in front - trusting one that is not there lets a caller set
  // X-Forwarded-For and look like a new client on every request
  app.set('trust proxy', env.trustProxy);

  app.use(requestLogger);
  app.use(apiLimiter);
  // rich text and whole-account imports are far bigger than the 100kb default
  // allows. only the notes routes get the larger limit - the global parser below
  // then sees a body that is already read and leaves it alone, so the
  // unauthenticated auth routes keep the small one
  app.use('/api/notes', express.json({ limit: '5mb' }));
  app.use(express.json());
  // populates req.cookies, which is where the session token arrives
  app.use(cookieParser());

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/notes', notesRouter);

  // these two go last - only reached if nothing above handled the request
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
