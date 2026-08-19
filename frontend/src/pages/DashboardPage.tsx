import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { listNotes, plainText, type Note } from '../api/notes';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/** The first letter of whatever we can call this person, for the avatar. */
function initial(from: string): string {
  return from.trim().charAt(0).toUpperCase();
}

/** When a note was last touched, in the reader's own locale. */
function changed(at: string): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The signed-in landing screen: everything this person has written. */
export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listNotes()
      .then((found) => {
        if (!cancelled) setNotes(found);
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

        <div className="notes-bar">
          <Link className="button" to="/notes/new">
            New note
          </Link>
        </div>

        {error !== null && (
          <p className="form-error" role="alert">
            Could not load your notes: {error}
          </p>
        )}

        {notes !== null && notes.length === 0 && (
          <div className="empty-state">
            <h2>A clean slate</h2>
            <p>Nothing written yet. Start with a new note.</p>
          </div>
        )}

        {notes !== null && notes.length > 0 && (
          <ul className="note-list">
            {notes.map((note) => (
              <li key={note.id}>
                <Link className="note-card" to={`/notes/${note.id}`}>
                  <h2 className="note-card-title">{note.title}</h2>
                  <p className="note-card-excerpt">{plainText(note.content)}</p>
                  <p className="note-card-date">{changed(note.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {notes === null && error === null && <p className="muted">Loading your notes...</p>}
      </main>
    </div>
  );
}
