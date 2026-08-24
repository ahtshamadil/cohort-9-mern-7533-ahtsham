import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  exportNotes,
  exportNotesAsText,
  importNotes,
  listNotes,
  plainText,
  type Note,
  type NoteSort,
} from '../api/notes';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/** How long to wait after the last keystroke before searching. */
const searchDelayMs = 300;

const sortOptions: { value: NoteSort; label: string }[] = [
  { value: 'recent', label: 'Recently changed' },
  { value: 'oldest', label: 'Least recently changed' },
  { value: 'created', label: 'Newest first' },
  { value: 'title', label: 'Title A to Z' },
];

/** When a note was last touched, in the reader's own locale. */
function changed(at: string): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** How many notes, worded so a screen reader is not read "1 notes". */
function counted(total: number): string {
  return `${total} ${total === 1 ? 'note' : 'notes'}`;
}

/** The signed-in landing screen: everything this person has written. */
export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // what is in the box, and what has actually been asked for
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<NoteSort>('recent');
  const [reloads, setReloads] = useState(0);

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // searching on every keystroke would be a request per letter. each one restarts
  // the timer, so only the last of a burst is ever asked for
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), searchDelayMs);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    listNotes({ q: term, sort })
      .then((found) => {
        if (cancelled) return;

        setNotes(found);
        setError(null);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    // searches started later win, whichever answer comes back first
    return () => {
      cancelled = true;
    };
  }, [term, sort, reloads]);

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

  /** Runs one of the two exports and says how it went. */
  async function saveExport(save: () => Promise<void>, done: string) {
    setBusy(true);
    setNotice(null);

    try {
      await save();
      setNotice({ text: done, failed: false });
    } catch (cause) {
      const because = cause instanceof Error ? cause.message : 'something went wrong';
      setNotice({ text: `Could not export your notes: ${because}`, failed: true });
    } finally {
      setBusy(false);
    }
  }

  /** Loads a chosen export file and shows the list again with it in. */
  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    // picking the same file twice fires no change event unless the input is cleared
    event.target.value = '';

    if (file === undefined) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const imported = await importNotes(file);

      setNotice({ text: `Imported ${counted(imported)}.`, failed: false });
      setReloads((count) => count + 1);
    } catch (cause) {
      const because = cause instanceof Error ? cause.message : 'the file could not be read';
      setNotice({ text: `Could not import that file: ${because}`, failed: true });
    } finally {
      setBusy(false);
    }
  }

  const displayName = user?.name ?? user?.email ?? '';
  const searching = term !== '';

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo />

        <div className="app-header-actions">
          <ThemeToggle />
          <span className="app-user">{displayName}</span>
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
        </div>

        <div className="notes-bar">
          <div className="notes-filters">
            <label className="visually-hidden" htmlFor="notes-search">
              Search notes
            </label>
            <input
              id="notes-search"
              type="search"
              className="notes-search"
              placeholder="Search your notes"
              // the API refuses a longer term, and stopping it here beats
              // answering a search with "Validation failed"
              maxLength={191}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <label className="visually-hidden" htmlFor="notes-sort">
              Sort notes
            </label>
            <select
              id="notes-sort"
              className="notes-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as NoteSort)}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="notes-actions">
            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={() => void saveExport(exportNotes, 'Your notes have been downloaded.')}
            >
              Export JSON
            </button>

            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={() =>
                void saveExport(exportNotesAsText, 'A text copy of your notes has been downloaded.')
              }
            >
              Export text
            </button>

            {/* a label rather than a button reaching for a hidden input, so the
                control announced is the file input itself */}
            <label className="button button-ghost" htmlFor="notes-import">
              Import
            </label>
            <input
              id="notes-import"
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              disabled={busy}
              onChange={(event) => void handleImport(event)}
            />

            <Link className="button" to="/notes/new">
              New note
            </Link>
          </div>
        </div>

        {notice !== null && (
          <p
            className={notice.failed ? 'form-error' : 'notes-notice'}
            role={notice.failed ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}

        {error !== null && (
          <p className="form-error" role="alert">
            Could not load your notes: {error}
          </p>
        )}

        {/* the list changes without anything being clicked, so the count is
            announced rather than left to be noticed */}
        <p className="visually-hidden" role="status">
          {notes === null ? '' : counted(notes.length)}
        </p>

        {notes !== null && notes.length === 0 && !searching && (
          <div className="empty-state">
            <h2>A clean slate</h2>
            <p>Nothing written yet. Start with a new note.</p>
          </div>
        )}

        {notes !== null && notes.length === 0 && searching && (
          <div className="empty-state">
            <h2>Nothing matches</h2>
            <p>No note has &quot;{term}&quot; in its title or its text.</p>
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
