import { Router } from 'express';

import { isDatabaseReachable } from '../db/prisma.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  // this stays a liveness check: it reports the database state but still answers
  // 200 when the database is down, so it means "the api is up" rather than
  // "everything is up". a strict readiness check belongs on its own route.
  const database = (await isDatabaseReachable()) ? 'ok' : 'down';

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database,
  });
});
