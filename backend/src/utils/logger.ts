import pino from 'pino';

import { isDevelopment, isTest } from '../config/env.js';

function resolveLevel() {
  if (isTest) return 'silent';
  return isDevelopment ? 'debug' : 'info';
}

export const logger = pino({
  level: resolveLevel(),
  transport: isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  // keep secrets out of the logs
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
});
