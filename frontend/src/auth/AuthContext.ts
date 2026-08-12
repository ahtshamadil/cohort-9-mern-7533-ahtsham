import { createContext } from 'react';

/** A user as the API describes one. Never carries a password. */
export interface User {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
}

/**
 * Whether anybody is signed in.
 *
 * `checking` is the state before /api/auth/me has answered. It matters: a guard
 * that treats "not known yet" as "signed out" sends a signed-in user to the
 * login page for a moment on every refresh.
 */
export type AuthStatus = 'checking' | 'signedIn' | 'signedOut';

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

// null rather than a default object, so useAuth can tell "no provider above me"
// apart from "a provider that happens to have nobody signed in"
export const AuthContext = createContext<AuthContextValue | null>(null);
