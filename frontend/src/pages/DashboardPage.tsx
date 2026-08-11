import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiFetch } from '../api/client';
import { useAuth } from '../auth/useAuth';

/** Shape of the payload returned by the backend's /api/health route. */
interface Health {
  status: string;
  uptime: number;
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

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main>
      <header className="dashboard-header">
        <h1>Notes</h1>
        <button type="button" onClick={() => void handleLogout()}>
          Log out
        </button>
      </header>

      <p>Signed in as {user?.name ?? user?.email}</p>

      {health && (
        <p>
          API status: <strong>{health.status}</strong>
        </p>
      )}
      {error !== null && <p role="alert">Could not reach the API: {error}</p>}
      {!health && error === null && <p>Checking the API...</p>}
    </main>
  );
}
