import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, byField } from '../api/client';
import { createNote, deleteNote, getNote, updateNote, type NotePermission } from '../api/notes';
import { RichTextEditor } from '../components/RichTextEditor';
import { ShareDialog } from '../components/ShareDialog';
import { useNoteRoom, type NoteChange } from '../realtime/socket';
import { FormField } from './FormField';

/** How long to wait after the last keystroke before saving. */
const saveDelayMs = 1000;

type Status = 'saved' | 'unsaved' | 'saving' | 'failed';

/** Why the note being shown is not there any more. */
type Gone = 'deleted' | 'revoked';

const goneWording: Record<Gone, { heading: string; detail: string }> = {
  deleted: {
    heading: 'This note has been deleted',
    detail: 'Whoever owns it removed it while you had it open.',
  },
  revoked: {
    heading: 'This note is not shared with you any more',
    detail: 'Whoever owns it took your access back while you had it open.',
  },
};

const wording: Record<Status, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving...',
  failed: 'Not saved',
};

/** The screen for writing one note, whether it exists yet or not. */
export function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const noteId = id === undefined ? null : Number(id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // a note being written is yours until it exists, so this starts at owner
  const [permission, setPermission] = useState<NotePermission>('owner');
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(noteId !== null);
  const [status, setStatus] = useState<Status>('saved');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [gone, setGone] = useState<Gone | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);

  const readOnly = permission === 'view';
  const owned = permission === 'owner';

  // the pending save reads these rather than the state it closed over, so a
  // keystroke landing while it waits is not left behind
  const latest = useRef({ title, content });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the newest version of this note that has been seen, whoever wrote it. events
  // can arrive out of order, and an older one must not win
  const seenAt = useRef<string | null>(null);

  // deleting your own note is answered over http and broadcast to the room at
  // the same time. without this the owner sees the gone screen for the note they
  // just deleted, rather than the list they asked to go back to
  const deleting = useRef(false);

  useEffect(() => {
    latest.current = { title, content };
  }, [title, content]);

  useEffect(() => {
    if (noteId === null) {
      return;
    }

    let cancelled = false;

    // the notice belongs to the note it was raised on, and this screen is reused
    // rather than remounted when the id changes
    setChangedElsewhere(false);

    getNote(noteId)
      .then((note) => {
        if (cancelled) return;

        // a socket change can arrive while this request is in flight, and it is
        // the newer of the two - the answer here is what the note was before it
        if (seenAt.current === null || note.updatedAt > seenAt.current) {
          setTitle(note.title);
          setContent(note.content);
          seenAt.current = note.updatedAt;
        }

        setPermission(note.permission);
        setLoading(false);
      })
      .catch((cause: Error) => {
        if (cancelled) return;

        setError(cause.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useNoteRoom(noteId, {
    onUpdated: (change: NoteChange) => {
      // ISO strings sort the way the instants they name do
      if (seenAt.current !== null && change.updatedAt <= seenAt.current) {
        return;
      }

      seenAt.current = change.updatedAt;

      // last write wins, and the editor says so rather than discovering it. an
      // incoming change must not land on top of what somebody is still typing,
      // so it is held back and their next save is the one that stands
      if (status !== 'saved') {
        setChangedElsewhere(true);
        return;
      }

      setTitle(change.title);
      setContent(change.content);
      setChangedElsewhere(false);
    },
    onDeleted: () => {
      if (!deleting.current) setGone('deleted');
    },
    onRevoked: () => setGone('revoked'),
  });

  // a timer left running after the screen closes would set state on nothing
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /** Reports what the API objected to, by field where it said so. */
  function handleFailure(cause: unknown) {
    if (cause instanceof ApiError) {
      setFieldErrors(byField(cause.fieldErrors));
      setError(cause.message);
      return;
    }

    setError('Could not save. Your last change is still here - try again.');
  }

  /** Saves, and says whether it worked so callers can stay put if it did not. */
  async function save(): Promise<boolean> {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    setStatus('saving');
    setError(null);
    setFieldErrors({});

    try {
      if (noteId === null) {
        const created = await createNote(latest.current);
        navigate(`/notes/${created.id}`, { replace: true });
      } else {
        const written = await updateNote(noteId, latest.current);

        // only ever forward, for the same reason
        if (seenAt.current === null || written.updatedAt > seenAt.current) {
          seenAt.current = written.updatedAt;
        }
      }

      setStatus('saved');

      return true;
    } catch (cause) {
      setStatus('failed');
      handleFailure(cause);

      return false;
    }
  }

  /** Called on every edit. Existing notes save themselves, new ones wait. */
  function changed() {
    // a view-only share cannot be written, so nothing here should reach the API
    if (readOnly) {
      return;
    }

    setStatus('unsaved');

    if (noteId === null) {
      return;
    }

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), saveDelayMs);
  }

  /** Leaves, but not before whatever is still pending has gone up. */
  async function handleBack() {
    // failed counts as pending - the text is still only in the browser
    if (!readOnly && (status === 'unsaved' || status === 'failed') && noteId !== null) {
      // staying put beats navigating away from work that never reached the server
      if (!(await save())) {
        return;
      }
    }

    navigate('/');
  }

  async function handleDelete() {
    if (noteId === null) {
      return;
    }

    if (timer.current !== null) clearTimeout(timer.current);

    deleting.current = true;

    try {
      await deleteNote(noteId);
      navigate('/', { replace: true });
    } catch {
      deleting.current = false;
      setError('Could not delete this note. Try again.');
      setConfirming(false);
    }
  }

  if (gone !== null) {
    return (
      <main className="app-main">
        <div className="empty-state">
          <h2>{goneWording[gone].heading}</h2>
          <p>{goneWording[gone].detail}</p>
          <button type="button" className="button gone-back" onClick={() => navigate('/')}>
            Back to your notes
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app-main">
        <div className="empty-state">
          <p>Loading this note...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-main">
      <div className="editor-bar">
        <button type="button" className="button button-ghost" onClick={() => void handleBack()}>
          Back
        </button>

        <span
          className={status === 'failed' && !readOnly ? 'editor-status failed' : 'editor-status'}
          role="status"
        >
          {readOnly ? 'View only' : wording[status]}
        </span>

        {changedElsewhere && (
          <span className="editor-changed">
            <span role="status">
              Somebody else changed this note while you were writing. What you have here is
              what gets saved.
            </span>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setChangedElsewhere(false)}
            >
              Dismiss
            </button>
          </span>
        )}

        <div className="editor-bar-actions">
          {owned && noteId !== null && (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setSharing(true)}
            >
              Share
            </button>
          )}

          {owned &&
            noteId !== null &&
            (confirming ? (
              <>
                <span className="muted">Delete this note?</span>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void handleDelete()}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            ))}

          {!readOnly && (
            <button
              type="button"
              className="button"
              disabled={status === 'saving'}
              onClick={() => void save()}
            >
              Save
            </button>
          )}
        </div>
      </div>

      {sharing && noteId !== null && (
        <ShareDialog noteId={noteId} onClose={() => setSharing(false)} />
      )}

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {readOnly ? (
        <h1 className="note-title-read">{title}</h1>
      ) : (
        <FormField
          id="note-title"
          label="Title"
          value={title}
          placeholder="Give it a name"
          error={fieldErrors.title}
          onChange={(value) => {
            setTitle(value);
            changed();
          }}
        />
      )}

      <RichTextEditor
        content={content}
        readOnly={readOnly}
        onChange={(html) => {
          setContent(html);
          changed();
        }}
      />
      {fieldErrors.content !== undefined && (
        <p className="field-error">{fieldErrors.content}</p>
      )}
    </main>
  );
}
