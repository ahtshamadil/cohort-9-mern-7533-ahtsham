import { Router } from 'express';
import { z } from 'zod';

import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sessionsWithdrawn } from '../realtime/socket.js';
import { validateBody } from '../middleware/validate.js';
import {
  authenticateUser,
  changePassword,
  findUserById,
  registerUser,
} from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { isCommonPassword } from '../utils/commonPasswords.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { maxPasswordBytes } from '../utils/password.js';
import { signToken } from '../utils/token.js';

/** What a password has to be for an account to accept it. */
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (value) => Buffer.byteLength(value) <= maxPasswordBytes,
    `Password must be ${maxPasswordBytes} bytes or fewer`,
  )
  .refine((value) => !isCommonPassword(value), 'That password is too common to use');

// zod 4 moved email off string()
const registerSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: newPassword,
  name: z.string().trim().min(1).max(100).optional(),
});

// no rules on the password here - an old password should still be able to log
// in, whatever it would fail today. capping the length would lock out an
// account made before the cap, since bcrypt only ever compares 72 bytes
const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword,
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { user, tokenVersion } = await registerUser(req.body);

  setAuthCookie(res, signToken(user.id, tokenVersion));

  res.status(201).json({ user });
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { user, tokenVersion } = await authenticateUser(req.body.email, req.body.password);

  setAuthCookie(res, signToken(user.id, tokenVersion));

  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);

  logger.info('User logged out');

  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  if (req.userId === undefined) {
    throw new HttpError(401, 'Authentication required');
  }

  const user = await findUserById(req.userId);

  if (user === null) {
    throw new HttpError(401, 'Authentication required');
  }

  res.json({ user });
});

authRouter.patch(
  '/password',
  authLimiter,
  requireAuth,
  validateBody(changePasswordSchema),
  async (req, res) => {
    if (req.userId === undefined) {
      throw new HttpError(401, 'Authentication required');
    }

    const version = await changePassword(
      req.userId,
      req.body.currentPassword,
      req.body.newPassword,
    );

    // the handshake only checks the version once, so the sockets the old
    // sessions opened have to be dropped rather than left running
    sessionsWithdrawn(req.userId);

    // every other session is now holding an older version, so this one needs a
    // fresh cookie or the change would sign the person doing it out too
    setAuthCookie(res, signToken(req.userId, version));

    res.status(204).send();
  },
);
