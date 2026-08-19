import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { authenticateUser, findUserById, registerUser } from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { signToken } from '../utils/token.js';

export const authRouter = Router();

// zod 4 moved email off string()
const registerSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(100).optional(),
});

// no minimum on the password here - an old password should still be able to log in
const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const user = await registerUser(req.body);

  setAuthCookie(res, signToken(user.id));

  res.status(201).json({ user });
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);

  setAuthCookie(res, signToken(user.id));

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
