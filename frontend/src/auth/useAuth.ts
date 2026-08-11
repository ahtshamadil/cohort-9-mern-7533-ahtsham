import { useContext } from 'react';

import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';

/** Reads the auth context. Throws if used outside an AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }

  return context;
}
