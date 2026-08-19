import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { notesRouter } from './routes/notes.js';

/** Builds the express app with middleware and routes wired up. */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(requestLogger);
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
