import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, byField } from '../api/client';
import { createNote, deleteNote, getNote, updateNote } from '../api/notes';
import { RichTextEditor } from '../components/RichTextEditor';
import { FormField } from './FormField';

/** The screen for writing one note, whether it exists yet or not. */
export function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const noteId = id === undefined ? null : Number(id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(noteId !== null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  /** Reports what the API objected to, by field where it said. */
  function handleFailure(cause: unknown) {
    if (cause instanceof ApiError) {
      setFieldErrors(byField(cause.fieldErrors));
      setError(cause.message);
      return;
    }

    setError('Could not save. Check your connection and try again.');
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      if (noteId === null) {
        const created = await createNote({ title, content });
        navigate(`/notes/${created.id}`, { replace: true });
      } else {
        await updateNote(noteId, { title, content });
      }

      setDirty(false);
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (noteId === null) {
      return;
    }

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
        <p className="muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="app-main">
      <div className="editor-bar">
        <button type="button" className="button button-ghost" onClick={() => navigate('/')}>
          Back
        </button>

        <span className="muted">{dirty ? 'Unsaved changes' : 'Saved'}</span>

        <div className="editor-bar-actions">
          {noteId !== null &&
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

          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <FormField
        id="note-title"
        label="Title"
        value={title}
        placeholder="Give it a name"
        error={fieldErrors.title}
        onChange={(value) => {
          setTitle(value);
          setDirty(true);
        }}
      />

      <RichTextEditor
        content={content}
        onChange={(html) => {
          setContent(html);
          setDirty(true);
        }}
      />
      {fieldErrors.content !== undefined && (
        <p className="field-error">{fieldErrors.content}</p>
      )}
    </main>
  );
}
