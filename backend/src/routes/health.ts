import { Router } from 'express';

import { isDatabaseReachable } from '../db/prisma.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  // this stays a liveness check: it reports the database state but still answers
  // 200 when the database is down, so it means "the api is up" rather than
  // "everything is up". a strict readiness check belongs on its own route.
  //
  // the probe gets a shorter deadline than the default here. liveness probes are
  // often configured to give up after a second, and a route that sits for two
  // would be called dead while the process is perfectly fine. a local database
  // answers in well under 50ms, so 500 is still generous.
  const database = (await isDatabaseReachable(500)) ? 'ok' : 'down';

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database,
  });
});
