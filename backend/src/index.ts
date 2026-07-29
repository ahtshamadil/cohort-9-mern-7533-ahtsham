import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Server listening on http://localhost:${env.port}`);
});
