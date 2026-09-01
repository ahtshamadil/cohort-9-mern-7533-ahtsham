import { useEffect, useRef, useState } from 'react';

import { ApiError, byField } from '../api/client';
import { listShares, shareNote, unshareNote, type Share, type SharePermission } from '../api/notes';

const permissions: { value: SharePermission; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'edit', label: 'Can edit' },
];

/** Whoever the account belongs to, by name where they gave one. */
function who(share: Share): string {
  return share.user.name ?? share.user.email;
}

/**
 * The panel behind the Share button: who a note is already shared with, and a
 * form to share it with somebody else.
 *
 * A div rather than a <dialog>, because jsdom implements neither showModal nor
 * the top layer, and a modal that cannot be tested is worse than one built out
 * of what the rest of the app already uses.
 */
export function ShareDialog({ noteId, onClose }: Readonly<{ noteId: number; onClose: () => void }>) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const panel = useRef<HTMLDivElement>(null);
  const changed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    listShares(noteId)
      .then((found) => {
        // sharing before the list arrives would otherwise be undone by it
        if (!cancelled && !changed.current) setShares(found);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    function handlePointer(event: MouseEvent) {
      if (!panel.current?.contains(event.target as Node)) onClose();
    }

    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [onClose]);

  /** Reports what the API objected to, by field where it said so. */
  function handleFailure(cause: unknown) {
    if (cause instanceof ApiError) {
      setFieldErrors(byField(cause.fieldErrors));
      setError(cause.message);
      return;
    }

    setError('Could not share this note. Check your connection and try again.');
  }

  async function handleShare() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const share = await shareNote(noteId, email, permission);

      changed.current = true;

      // sharing again changes what an existing share grants rather than adding
      // a second one, so the row is replaced where there already was one
      setShares((current) => [
        ...(current ?? []).filter((held) => held.user.id !== share.user.id),
        share,
      ]);
      setEmail('');
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: number) {
    setBusy(true);
    setError(null);

    try {
      await unshareNote(noteId, userId);

      changed.current = true;
      setShares((current) => (current ?? []).filter((held) => held.user.id !== userId));
    } catch {
      setError('Could not remove that person. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-backdrop">
      <div
        className="share-dialog"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-heading"
      >
        <div className="share-heading">
          <h2 id="share-heading">Share this note</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <form
          className="share-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleShare();
          }}
        >
          <div className="field">
            <label htmlFor="share-email">Email address</label>
            <input
              id="share-email"
              type="email"
              value={email}
              placeholder="somebody@example.com"
              required
              autoFocus
              aria-invalid={fieldErrors.email !== undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email !== undefined && (
              <p className="field-error">{fieldErrors.email}</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="share-permission">Permission</label>
            <select
              id="share-permission"
              value={permission}
              onChange={(event) => setPermission(event.target.value as SharePermission)}
            >
              {permissions.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="button share-submit" disabled={busy}>
            Share
          </button>
        </form>

        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {shares !== null && shares.length === 0 && (
          <p className="muted">This note is not shared with anybody yet.</p>
        )}

        {shares !== null && shares.length > 0 && (
          <ul className="share-list">
            {shares.map((share) => (
              <li key={share.user.id}>
                <span className="share-person">
                  <span className="share-name">{who(share)}</span>
                  <span className="muted">
                    {share.permission === 'edit' ? 'Can edit' : 'Can view'}
                  </span>
                </span>
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={busy}
                  onClick={() => void handleRemove(share.user.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {shares === null && error === null && <p className="muted">Loading...</p>}
      </div>
    </div>
  );
}
