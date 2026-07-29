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

export const env = {
  port: readNumber('PORT', 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

export const isDevelopment = env.nodeEnv === 'development';
export const isTest = env.nodeEnv === 'test';
