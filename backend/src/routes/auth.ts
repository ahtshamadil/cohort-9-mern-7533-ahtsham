import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { authenticateUser, findUserById, registerUser } from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { HttpError } from '../utils/httpError.js';
import { signToken } from '../utils/token.js';

export const authRouter = Router();

// zod 4 moved email off string(), so this is z.email() and not z.string().email()
const registerSchema = z.object({
  email: z.email('Enter a valid email address'),
  // length rather than a mix of symbols and digits: a long passphrase is both
  // harder to guess and easier to remember than something like P@ssw0rd
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(100).optional(),
});

// no minimum on the password here. the rule belongs on the account being made,
// and applying it at login would reject a valid old password with a 400 that
// also happens to advertise the current policy
const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const user = await registerUser(req.body);

  // signing in straight after signing up saves a pointless second form
  setAuthCookie(res, signToken(user.id));

  res.status(201).json({ user });
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);

  setAuthCookie(res, signToken(user.id));

  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  // the token stays valid until it expires - a jwt cannot be recalled. dropping
  // the cookie is what ends the session as far as this browser is concerned
  clearAuthCookie(res);

  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  // requireAuth has already set this, but it is optional on the request type,
  // so the check is what proves that to the compiler
  if (req.userId === undefined) {
    throw new HttpError(401, 'Authentication required');
  }

  const user = await findUserById(req.userId);

  // a signed token for an account that no longer exists. nothing to serve, and
  // the caller should be treated as logged out
  if (user === null) {
    throw new HttpError(401, 'Authentication required');
  }

  res.json({ user });
});
