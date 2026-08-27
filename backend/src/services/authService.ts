import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

/** A user as another account sees them, on a note they own or were shared. */
export interface UserSummary {
  id: number;
  email: string;
  name: string | null;
}

/** A user without the password hash. */
export interface PublicUser extends UserSummary {
  createdAt: Date;
}

/** The fields of a user that may be shown to a different account. */
export const userSummaryFields = { id: true, email: true, name: true } as const;

const publicFields = { ...userSummaryFields, createdAt: true } as const;

/** Picks only the fields a client may see. */
function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

/** Lowercases and trims an address so one account cannot be made twice. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// compared against when no account matched, so both branches take the same time
const decoyHash: Promise<string> = hashPassword('there is no account with this address');
decoyHash.catch(() => undefined);

/** Creates a user. Throws 409 if the email is taken. */
export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: normaliseEmail(input.email),
        passwordHash,
        name: input.name ?? null,
      },
      select: publicFields,
    });

    logger.info({ userId: user.id }, 'User registered');

    return user;
  } catch (error) {
    // P2002 is prisma's unique constraint code. letting the database refuse the
    // duplicate avoids the race a findUnique-then-create would have
    if ((error as { code?: string }).code === 'P2002') {
      throw new HttpError(409, 'That email is already registered');
    }

    throw error;
  }
}

/** Returns the user if the credentials are right, throws 401 if not. */
export async function authenticateUser(email: string, password: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: normaliseEmail(email) },
    select: { ...publicFields, passwordHash: true },
  });

  const invalid = new HttpError(401, 'Invalid email or password');

  if (user === null) {
    await verifyPassword(password, await decoyHash);
    logger.warn('Failed login');
    throw invalid;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    logger.warn({ userId: user.id }, 'Failed login');
    throw invalid;
  }

  logger.info({ userId: user.id }, 'User logged in');

  return toPublicUser(user);
}

/** Finds a user by id, or null if the account is gone. */
export function findUserById(id: number): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicFields });
}

/** Finds a user by address, normalised the same way registering normalises it. */
export function findUserByEmail(email: string): Promise<UserSummary | null> {
  return prisma.user.findUnique({
    where: { email: normaliseEmail(email) },
    select: userSummaryFields,
  });
}
