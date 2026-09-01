import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';

import { ApiError, byField, changePassword, maxPasswordLength } from '../api/client';
import { FormField } from '../pages/FormField';

export function ChangePasswordDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const panel = useRef<HTMLDivElement>(null);

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

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);
    setFieldErrors({});

    // the API never sees the confirmation - it is a question about this form
    if (newPassword !== confirmation) {
      setFieldErrors({ confirmation: 'The two passwords do not match' });
      return;
    }

    setSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);

      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message);
        setFieldErrors(byField(cause.fieldErrors));
      } else {
        setFormError('Could not reach the server. Check that the API is running.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-heading"
      >
        <div className="dialog-heading">
          <h2 id="change-password-heading">
            {done ? 'Password changed' : 'Change your password'}
          </h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {done ? (
          <>
            <p className="muted">Anywhere else you were signed in has been signed out.</p>
            <button type="button" className="button" onClick={onClose}>
              Back to your notes
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="muted">Everywhere else you are signed in will be signed out.</p>

            {formError !== null && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}

            <FormField
              id="currentPassword"
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              error={fieldErrors.currentPassword}
              autoComplete="current-password"
              maxLength={maxPasswordLength}
              autoFocus
            />

            <FormField
              id="newPassword"
              label="New password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              error={fieldErrors.newPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              maxLength={maxPasswordLength}
            />

            <FormField
              id="confirmation"
              label="New password again"
              type="password"
              value={confirmation}
              onChange={setConfirmation}
              error={fieldErrors.confirmation}
              autoComplete="new-password"
              maxLength={maxPasswordLength}
            />

            <div className="dialog-actions">
              <button type="submit" className="button" disabled={submitting}>
                {submitting && <span className="spinner" aria-hidden="true" />}
                Change password
              </button>
              <button type="button" className="button button-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
