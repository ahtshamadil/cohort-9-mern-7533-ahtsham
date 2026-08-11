import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, byField } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { FormField } from './FormField';

/** Sign-up screen. Registering also signs you in, so it ends on the dashboard. */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      // the api treats name as optional, and an empty box means "not given"
      // rather than "a name that is the empty string"
      await register({ email, password, name: name.trim() === '' ? undefined : name.trim() });

      navigate('/', { replace: true });
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
    <main className="auth-page">
      <h1>Sign up</h1>

      <form onSubmit={handleSubmit} noValidate>
        {formError !== null && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <FormField
          id="name"
          label="Name (optional)"
          value={name}
          onChange={setName}
          error={fieldErrors.name}
          autoComplete="name"
          required={false}
        />

        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="new-password"
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Sign up'}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
