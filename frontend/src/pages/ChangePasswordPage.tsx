import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError, byField, changePassword, maxPasswordLength } from '../api/client';
import { AuthLayout } from './AuthLayout';
import { FormField } from './FormField';

/**
 * Changing the password of the account already signed in.
 *
 * Doing it ends every other session, so it says so before rather than after.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);
    setFieldErrors({});

    // checked here and nowhere else - the API never sees the confirmation,
    // because it is a question about this form rather than about the account
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

  if (done) {
    return (
      <AuthLayout
        eyebrow="Account"
        title="Password changed"
        subtitle="Anywhere else you were signed in has been signed out."
      >
        <button type="button" className="button" onClick={() => navigate('/')}>
          Back to your notes
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Account"
      title="Change your password"
      subtitle="Everywhere else you are signed in will be signed out."
    >
      <form onSubmit={handleSubmit} noValidate>
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

        <button type="submit" className="button" disabled={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          Change password
        </button>

        <button type="button" className="button button-ghost" onClick={() => navigate('/')}>
          Cancel
        </button>
      </form>
    </AuthLayout>
  );
}
