import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

// an explicit http server rather than app.listen, so a socket server can share
// the same one
const server = createServer(createApp());

server.listen(env.port, () => {
  logger.info(`Server listening on http://localhost:${env.port}`);
});
