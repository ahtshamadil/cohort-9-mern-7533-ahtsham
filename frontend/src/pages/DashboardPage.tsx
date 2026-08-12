import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiFetch } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/** Shape of the payload returned by the backend's /api/health route. */
interface Health {
  status: string;
  uptime: number;
  database?: string;
}

/** The first letter of whatever we can call this person, for the avatar. */
function initial(from: string): string {
  return from.trim().charAt(0).toUpperCase();
}

/**
 * The signed-in landing screen.
 *
 * A placeholder for now: it proves the session works and offers a way out. The
 * list of notes lands here in the notes PR.
 */
export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Health>('/api/health')
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Ends the session and leaves, or reports why it could not. */
  async function handleLogout() {
    setLogoutError(null);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // the cookie is cleared by the server, so a failed request means the
      // session is still live. saying so beats navigating away and leaving
      // someone believing they signed out on a shared machine when they did not
      setLogoutError('Could not log out. Check your connection and try again.');
    }
  }

  const displayName = user?.name ?? user?.email ?? '';

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo />

        <div className="app-header-actions">
          <ThemeToggle />
          <span className="avatar" title={displayName}>
            {initial(displayName)}
          </span>
          <button type="button" className="button button-ghost" onClick={() => void handleLogout()}>
            Log out
          </button>
        </div>
      </header>

      <main className="app-main">
        {logoutError !== null && (
          <p className="form-error" role="alert">
            {logoutError}
          </p>
        )}

        <div className="page-heading">
          <p className="eyebrow">Your slate</p>
          <h1>Everything worth remembering</h1>
          <p className="muted">Signed in as {displayName}</p>
        </div>

        <div className="empty-state">
          <h2>A clean slate</h2>
          <p>Your notes will appear here once the editor lands.</p>
        </div>

        <p className="status-row">
          <span
            className={`status-dot ${health ? 'status-dot-ok' : ''} ${error !== null ? 'status-dot-down' : ''}`}
          />
          {health && (
            <>
              API status: <strong>{health.status}</strong>
            </>
          )}
          {error !== null && <>Could not reach the API: {error}</>}
          {!health && error === null && <>Checking the API...</>}
        </p>
      </main>
    </div>
  );
}
