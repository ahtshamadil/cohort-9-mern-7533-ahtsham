import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, byField } from '../api/client';
import { createNote, deleteNote, getNote, updateNote, type NotePermission } from '../api/notes';
import { RichTextEditor } from '../components/RichTextEditor';
import { ShareDialog } from '../components/ShareDialog';
import { FormField } from './FormField';

/** How long to wait after the last keystroke before saving. */
const saveDelayMs = 1000;

type Status = 'saved' | 'unsaved' | 'saving' | 'failed';

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

  const readOnly = permission === 'view';
  const owned = permission === 'owner';

  // the pending save reads these rather than the state it closed over, so a
  // keystroke landing while it waits is not left behind
  const latest = useRef({ title, content });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { title, content };
  }, [title, content]);

  useEffect(() => {
    if (noteId === null) {
      return;
    }

    let cancelled = false;

    getNote(noteId)
      .then((note) => {
        if (cancelled) return;

        setTitle(note.title);
        setContent(note.content);
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
        await updateNote(noteId, latest.current);
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

    try {
      await deleteNote(noteId);
      navigate('/', { replace: true });
    } catch {
      setError('Could not delete this note. Try again.');
      setConfirming(false);
    }
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
