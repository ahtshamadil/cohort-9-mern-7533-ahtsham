import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

// mysql 8.4 authenticates with caching_sha2_password. the first login after the
// server starts is not in its cache yet, so the client has to fetch the server's
// public key, and the driver refuses to do that unless asked. set here rather
// than in DATABASE_URL so the prisma migrate engine still gets a plain url.
const connectionUrl = new URL(env.databaseUrl);

// fetching that key over an unencrypted connection weakens the protection
// against a man in the middle, so it is limited to local development. a real
// deployment should connect over TLS, which removes the need for it entirely.
if (env.nodeEnv !== 'production') {
  connectionUrl.searchParams.set('allowPublicKeyRetrieval', 'true');
}

// prisma 7 talks to the database through a driver adapter rather than a url
// declared in schema.prisma
const adapter = new PrismaMariaDb(connectionUrl.toString());

/** Shared Prisma client. One instance is reused for the whole process. */
export const prisma = new PrismaClient({ adapter });

/**
 * True if the database answers a trivial query within the timeout, false if it
 * is unreachable or too slow.
 */
export async function isDatabaseReachable(timeoutMs = 2000): Promise<boolean> {
  // the driver sits and waits on an unreachable host for far longer than a
  // health check should, so the probe gets its own deadline. without this the
  // route hangs and the test suite times out whenever the database is stopped.
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('database probe timed out')), timeoutMs);
    // do not let a pending probe hold the process open
    timer.unref();
  });

  try {
    // built inside the try so that even a synchronous throw from the client
    // returns false rather than escaping. this function must never reject - the
    // health route depends on always getting a boolean back.
    const probe = prisma.$queryRaw`SELECT 1`;
    // the probe can still reject after the deadline has already won the race,
    // and an unwatched rejection would crash the process
    probe.catch(() => undefined);

    await Promise.race([probe, deadline]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
