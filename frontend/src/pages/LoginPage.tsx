import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, byField } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { FormField } from './FormField';

/** Log-in screen. Sends people to the dashboard once they are signed in. */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

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
      await login(email, password);

      // replace, so the back button does not return to a login form that would
      // just bounce them forward again
      navigate('/', { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        // a 401 is about the pair of values, not either field on its own, so it
        // shows above the form rather than under one input
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
      <h1>Log in</h1>

      <form onSubmit={handleSubmit} noValidate>
        {formError !== null && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

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
          autoComplete="current-password"
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p>
        No account yet? <Link to="/register">Sign up</Link>
      </p>
    </main>
  );
}
