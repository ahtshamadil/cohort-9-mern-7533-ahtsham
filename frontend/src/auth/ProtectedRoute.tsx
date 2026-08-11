import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from './useAuth';

/** Wraps the routes that need somebody signed in. */
export function ProtectedRoute() {
  const { status } = useAuth();

  // nothing is rendered while /api/auth/me is still in flight. treating "not
  // known yet" as "signed out" would send a signed-in user to the login page for
  // a moment on every refresh, which looks like being logged out at random
  if (status === 'checking') {
    return null;
  }

  // replace, so the back button does not walk into the page they just failed to
  // reach and bounce them again
  return status === 'signedIn' ? <Outlet /> : <Navigate to="/login" replace />;
}
