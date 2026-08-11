import { useCallback, useEffect, useMemo, useState } from 'react';
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

  // the session cookie is httpOnly, so there is nothing here that javascript can
  // read to find out whether somebody is signed in. asking the api is the only
  // way to know, and it happens once when the app mounts.
  useEffect(() => {
    let cancelled = false;

    apiFetch<UserResponse>('/api/auth/me')
      .then((data) => {
        if (!cancelled) {
          setUser(data.user);
          setStatus('signedIn');
        }
      })
      .catch(() => {
        // a 401 is the ordinary answer for a visitor, not a failure worth
        // reporting. anything else here also means we cannot show them the app
        if (!cancelled) {
          setUser(null);
          setStatus('signedOut');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<UserResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // the response carries the user, so there is no need to ask /me again
    setUser(data.user);
    setStatus('signedIn');
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await apiFetch<UserResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    // registering signs you in, so there is no second trip to the login form
    setUser(data.user);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await apiFetch<void>('/api/auth/logout', { method: 'POST' });

    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
