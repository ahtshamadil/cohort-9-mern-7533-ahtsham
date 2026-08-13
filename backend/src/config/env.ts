import dotenv from 'dotenv';

dotenv.config();

/** Reads a numeric env variable, using the fallback if unset. Throws if it is not a number. */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, received "${raw}"`);
  }

  return parsed;
}

/** Reads a required string env variable. Throws if it is missing or blank. */
function readString(name: string): string {
  const raw = process.env[name]?.trim();
  // a whitespace-only value is a mistake, not a value. catching it here gives a
  // clear message instead of a confusing failure further along
  if (raw === undefined || raw === '') {
    throw new Error(`Environment variable ${name} is required`);
  }

  return raw;
}

/** Reads the token signing key. Rejects one short enough to be brute forced. */
function readSecret(name: string): string {
  const value = readString(name);
  if (value.length < 32) {
    throw new Error(`Environment variable ${name} must be at least 32 characters`);
  }

  return value;
}

/** Reads a count of seconds. Rejects zero, negatives and Infinity. */
function readSeconds(name: string, fallback: number): number {
  const value = readNumber(name, fallback);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Environment variable ${name} must be a whole number of seconds above zero, received "${value}"`,
    );
  }

  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  port: readNumber('PORT', 4000),
  nodeEnv,
  // tests get their own database so a test run never wipes development data
  databaseUrl: nodeEnv === 'test' ? readString('TEST_DATABASE_URL') : readString('DATABASE_URL'),
  jwtSecret: readSecret('JWT_SECRET'),
  // used for both the token expiry and the cookie max-age, so they always match
  jwtExpiresInSeconds: readSeconds('JWT_EXPIRES_IN_SECONDS', 604800),
};

export const isDevelopment = env.nodeEnv === 'development';
export const isTest = env.nodeEnv === 'test';
