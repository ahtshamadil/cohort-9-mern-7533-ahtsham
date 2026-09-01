import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  exportNotes,
  exportNotesAsText,
  importNotes,
  listNotes,
  listSharedNotes,
  plainText,
  setPinned,
  type Note,
  type NoteSort,
} from '../api/notes';
import { useAuth } from '../auth/useAuth';
import { AccountMenu } from '../components/AccountMenu';
import { ExportMenu, type ExportFormat } from '../components/ExportMenu';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { useUserEvents } from '../realtime/socket';

/** Which of the two lists the dashboard is showing. */
type Tab = 'mine' | 'shared';

/** How long to wait after the last keystroke before searching. */
const searchDelayMs = 300;

/** How many notes one page holds. Sent rather than left to the API's own default. */
const pageSize = 20;

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

/** Pinned first, then whatever order the API sent them in. */
function pinnedFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

/** Whoever owns a shared note, by name where they gave one. */
function ownerName(note: Note): string {
  return note.owner.name ?? note.owner.email;
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
  const [tab, setTab] = useState<Tab>('mine');
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0);

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // the note that has just been pinned, so only that card plays the animation
  const [justPinned, setJustPinned] = useState<number | null>(null);

  // searching on every keystroke would be a request per letter. each one restarts
  // the timer, so only the last of a burst is ever asked for
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      // a search narrows the list, so whatever page number was reached in the
      // old one means nothing in the new one
      setPage(1);
    }, searchDelayMs);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const load = tab === 'mine' ? listNotes : listSharedNotes;

    load({ q: term, sort, page, limit: pageSize })
      .then(({ notes: found, total: matched }) => {
        if (cancelled) return;

        setNotes(pinnedFirst(found));
        setTotal(matched);
        setError(null);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    // searches started later win, whichever answer comes back first
    return () => {
      cancelled = true;
    };
  }, [term, sort, tab, page, reloads]);

  // both of these only ever reach the account they are about, so the only list
  // they can change is the shared one. the note itself is not in the message -
  // it is asked for again, and comes back shaped for whoever is reading it
  useUserEvents({
    onShareChanged: () => {
      if (tab === 'shared') setReloads((count) => count + 1);
    },
  });

  // deleting the last note on the last page leaves the list sitting past the end
  // of itself, which looks like an empty account rather than an empty page
  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / pageSize));

    if (page > last) setPage(last);
  }, [total, page]);

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

  /**
   * Pins or unpins a note.
   *
   * The card moves before the API answers, because waiting a round trip to see
   * a pin land makes the animation look like a fault. A refusal puts it back.
   */
  async function togglePin(note: Note) {
    const pinned = !note.pinned;
    // the list as it stands, to put back if the save is refused. rebuilding it
    // from the changed one would restore the pin but not the order it was in
    const before = notes;

    setNotes((current) =>
      current === null
        ? current
        : pinnedFirst(current.map((held) => (held.id === note.id ? { ...held, pinned } : held))),
    );

    if (pinned) {
      setJustPinned(note.id);
    }

    try {
      await setPinned(note.id, pinned);
    } catch {
      setNotes(before);
      setNotice({ text: 'Could not change that pin. Try again.', failed: true });
    }
  }

  /** Runs whichever export the menu asked for and says how it went. */
  async function saveExport(format: ExportFormat) {
    setBusy(true);
    setNotice(null);

    try {
      await (format === 'json' ? exportNotes() : exportNotesAsText());
      setNotice({
        text:
          format === 'json'
            ? 'Your notes have been downloaded.'
            : 'A text copy of your notes has been downloaded.',
        failed: false,
      });
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

    if (!file.name.toLowerCase().endsWith('.json')) {
      setNotice({
        text: 'Import needs a .json export file. Use Export to make one.',
        failed: true,
      });
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

  /** Moves to the other list, clearing what the last one left on screen. */
  function showTab(next: Tab) {
    if (next === tab) {
      return;
    }

    setTab(next);
    setPage(1);
    setNotes(null);
    setNotice(null);
    setError(null);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const displayName = user?.name ?? user?.email ?? '';
  const searching = term !== '';
  const mine = tab === 'mine';

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo />

        <div className="app-header-actions">
          <ThemeToggle />
          <AccountMenu name={displayName} />
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

        <div className="notes-tabs" role="tablist" aria-label="Which notes to show">
          <button
            type="button"
            role="tab"
            aria-selected={mine}
            className={mine ? 'notes-tab notes-tab-current' : 'notes-tab'}
            onClick={() => showTab('mine')}
          >
            Your notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!mine}
            className={mine ? 'notes-tab' : 'notes-tab notes-tab-current'}
            onClick={() => showTab('shared')}
          >
            Shared with you
          </button>
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
              placeholder={mine ? 'Search your notes' : 'Search shared notes'}
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
              onChange={(event) => {
                setSort(event.target.value as NoteSort);
                setPage(1);
              }}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="notes-actions">
            {/* export and import both act on the notes you own, so they are not
                offered over a list of somebody else's */}
            {mine && (
              <>
                <ExportMenu disabled={busy} onChoose={(format) => void saveExport(format)} />

                {/* a label rather than a button reaching for a hidden input, so the
                    control announced is the file input itself */}
                <label className="button button-ghost" htmlFor="notes-import">
                  Import JSON
                </label>
                <input
                  id="notes-import"
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(event) => void handleImport(event)}
                />
              </>
            )}

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
            Could not load {mine ? 'your notes' : 'the notes shared with you'}: {error}
          </p>
        )}

        {/* the list changes without anything being clicked, so the count is
            announced rather than left to be noticed */}
        <output className="visually-hidden">{notes === null ? '' : counted(total)}</output>

        {notes !== null && notes.length === 0 && !searching && (
          <div className="empty-state">
            <h2>{mine ? 'A clean slate' : 'Nothing shared yet'}</h2>
            <p>
              {mine
                ? 'Nothing written yet. Start with a new note.'
                : 'When somebody shares a note with you, it turns up here.'}
            </p>
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
              <li
                key={note.id}
                className={
                  note.pinned && note.id === justPinned ? 'note-item pinning' : 'note-item'
                }
                onAnimationEnd={() => setJustPinned(null)}
              >
                <Link className="note-card" to={`/notes/${note.id}`}>
                  <h2 className="note-card-title">{note.title}</h2>
                  <p className="note-card-excerpt">{plainText(note.content)}</p>
                  <p className="note-card-date">
                    {changed(note.updatedAt)}
                    {!mine && ` - ${ownerName(note)}`}
                    {note.permission === 'view' && ' - view only'}
                  </p>
                </Link>

                {/* only the owner may pin, and the button sits outside the link
                    rather than inside it - a button within an anchor is not
                    valid, and clicking it would follow the link as well */}
                {mine && (
                  <button
                    type="button"
                    className={note.pinned ? 'pin-button pinned' : 'pin-button'}
                    aria-pressed={note.pinned}
                    aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                    onClick={() => void togglePin(note)}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path
                        d="M9 4h6l-1 5 3 3v2h-4v5l-1 1-1-1v-5H7v-2l3-3z"
                        fill={note.pinned ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {notes !== null && pages > 1 && (
          <nav className="pager" aria-label="Pages of notes">
            <button
              type="button"
              className="button button-ghost"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>

            <span className="muted">
              Page {page} of {pages} - {counted(total)}
            </span>

            <button
              type="button"
              className="button button-ghost"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        )}

        {notes === null && error === null && (
          <div className="empty-state">
            <p>{mine ? 'Loading your notes...' : 'Loading the notes shared with you...'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
