import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { apiFetch } from '../api/client';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, AuthStatus, RegisterInput, User } from './AuthContext';

/** Both sign-in routes answer with the user they signed in. */
interface UserResponse {
  user: User;
}

/** Holds who is signed in and the calls that change it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');

  // Bumped by anything that settles who is signed in. The bootstrap request
  // below notes the value it started with and drops its answer if it no longer
  // matches.
  //
  // Without it a slow session check undoes a login that happened while it was
  // still in the air: the check was sent when nobody was signed in, so it comes
  // back 401, and that answer - correct when it was asked, stale by the time it
  // lands - signs the new session straight back out.
  const generation = useRef(0);

  /** Settles who is signed in, and voids anything still in flight. */
  const settle = useCallback((next: User | null) => {
    generation.current += 1;
    setUser(next);
    setStatus(next === null ? 'signedOut' : 'signedIn');
  }, []);

  // the session cookie is httpOnly, so there is nothing here that javascript can
  // read to find out whether somebody is signed in. asking the api is the only
  // way to know, and it happens once when the app mounts.
  useEffect(() => {
    const startedAt = generation.current;
    const stillCurrent = () => generation.current === startedAt;

    apiFetch<UserResponse>('/api/auth/me')
      .then((data) => {
        if (stillCurrent()) {
          setUser(data.user);
          setStatus('signedIn');
        }
      })
      .catch(() => {
        // a 401 is the ordinary answer for a visitor, not a failure worth
        // reporting. anything else here also means we cannot show them the app
        if (stillCurrent()) {
          setUser(null);
          setStatus('signedOut');
        }
      });

    // voids this request rather than tracking a cancelled flag of its own, so
    // unmounting and signing in go through the same door
    return () => {
      generation.current += 1;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<UserResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // the response carries the user, so there is no need to ask /me again
      settle(data.user);
    },
    [settle],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await apiFetch<UserResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      // registering signs you in, so there is no second trip to the login form
      settle(data.user);
    },
    [settle],
  );

  const logout = useCallback(async () => {
    await apiFetch<void>('/api/auth/logout', { method: 'POST' });

    settle(null);
  }, [settle]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
