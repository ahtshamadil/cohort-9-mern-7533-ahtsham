import express, { type Express } from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(requestLogger);
  app.use(express.json());

  app.use('/api', healthRouter);

  // these two go last - only reached if nothing above handled the request
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
