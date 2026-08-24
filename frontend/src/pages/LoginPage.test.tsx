import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

describe('LoginPage', () => {
  afterEach(restoreFetch);

  /** Fills both fields and submits. */
  async function logIn(password = 'correct horse battery') {
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), 'ahtsham@example.com');
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
  }

  it('signs in and lands on the dashboard', async () => {
    stubApi({
      // nobody is signed in when the app mounts, so the guard sends us here
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      'POST /api/auth/login': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
    });

    renderApp('/login');
    await logIn();

    expect(await screen.findByRole('heading', { name: 'Everything worth remembering' })).toBeInTheDocument();
  });

  it('shows the error and stays put when the credentials are wrong', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      'POST /api/auth/login': {
        status: 401,
        body: { error: { message: 'Invalid email or password' } },
      },
    });

    renderApp('/login');
    await logIn('not the password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    // still on the form, rather than having been let through
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('falls back to a plain message when the server cannot be reached', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      // fetch rejects rather than answering, which is a different path than any
      // status code: there is no envelope to read and no ApiError to build
      'POST /api/auth/login': { status: 0, networkError: true },
    });

    renderApp('/login');
    await logIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('puts a field error underneath the field it belongs to', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      'POST /api/auth/login': {
        status: 400,
        body: {
          error: {
            message: 'Validation failed',
            details: [{ field: 'email', message: 'Enter a valid email address' }],
          },
        },
      },
    });

    renderApp('/login');
    await logIn();

    const emailInput = await screen.findByLabelText('Email');

    await waitFor(() => {
      expect(emailInput).toHaveAccessibleDescription('Enter a valid email address');
    });
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  });
});
