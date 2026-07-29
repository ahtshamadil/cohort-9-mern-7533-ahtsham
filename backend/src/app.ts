import express from 'express';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json());

  app.use('/api', healthRouter);

  // these two go last - only reached if nothing above handled the request
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
