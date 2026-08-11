import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

/** A user as the API describes one. Deliberately has no password field. */
export interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
}

// asking for columns by name means a column added to the model later cannot
// appear in a response without somebody choosing to put it here
const publicFields = { id: true, email: true, name: true, createdAt: true } as const;

/** Picks the fields a client may see, so the hash cannot travel by accident. */
function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

/**
 * Trims and lowercases an address.
 *
 * Applied on the way in and on every lookup, so Ahtsham@example.com and
 * ahtsham@example.com are one account rather than two.
 */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Creates a user and returns them. Throws 409 if the address is taken. */
export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.user.create({
      data: {
        email: normaliseEmail(input.email),
        passwordHash,
        name: input.name ?? null,
      },
      select: publicFields,
    });
  } catch (error) {
    // P2002 is prisma's unique constraint code. letting the database refuse the
    // duplicate avoids the race a findUnique-then-create has between its two
    // queries, where two signups can both see the address as free
    if ((error as { code?: string }).code === 'P2002') {
      // this does tell a stranger which addresses are registered. a signup form
      // has to explain why it refused, so the disclosure is the accepted trade
      throw new HttpError(409, 'That email is already registered');
    }

    throw error;
  }
}

// A hash of a password nobody has, compared against when no account matched.
//
// Hashed here rather than written in as a constant so it costs whatever this
// environment costs, and the two branches below stay level as that changes.
//
// Started at import rather than on first use. Left lazy, the first unknown
// address after a restart pays to build this on top of the comparison itself,
// which measured at twice the time of every request after it - a tell of
// exactly the kind this decoy exists to remove, just rarer. Nothing waits on
// the promise here; by the time a request arrives it has almost always settled,
// and if not, awaiting it costs the request that would have built it anyway.
const decoyHash: Promise<string> = hashPassword('there is no account with this address');

// an unhandled rejection would take the process down, and this is only ever
// awaited inside authenticateUser's try-free path
decoyHash.catch(() => undefined);

/** Returns the user if the credentials are right, throws 401 if they are not. */
export async function authenticateUser(email: string, password: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: normaliseEmail(email) },
    select: { ...publicFields, passwordHash: true },
  });

  // the same message whether the address is unknown or the password is wrong.
  // two different answers would let anyone check which addresses have accounts
  const invalid = new HttpError(401, 'Invalid email or password');

  if (user === null) {
    // the message alone is not enough. returning here would answer an unknown
    // address in about a millisecond and a wrong password in a few hundred,
    // because only one of the two pays for a bcrypt comparison. that gap is
    // plainly visible over a network and enumerates accounts just as well as
    // two different messages would, so this branch buys the same comparison
    // and throws away the answer
    await verifyPassword(password, await decoyHash);
    throw invalid;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw invalid;
  }

  return toPublicUser(user);
}

/** Looks up a user by id, or null if the account has since been deleted. */
export function findUserById(id: number): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicFields });
}
