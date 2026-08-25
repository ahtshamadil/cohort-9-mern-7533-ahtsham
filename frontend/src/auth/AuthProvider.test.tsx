import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

describe('AuthProvider', () => {
  afterEach(restoreFetch);

  it('keeps the session when the bootstrap check answers after a login', async () => {
    stubApi({
      // still in flight when the form is submitted, and it answers 401 because
      // at the moment it was sent nobody was signed in. that answer is stale by
      // the time it lands and must not be allowed to sign the new session out
      'GET /api/auth/me': {
        status: 401,
        body: { error: { message: 'Authentication required' } },
        delayMs: 1500,
      },
      'POST /api/auth/login': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
    });

    renderApp('/login');
    // no per-keystroke delay: the point is to finish logging in while the
    // bootstrap request is still outstanding, and typing at human speed takes
    // longer than the request does
    const user = userEvent.setup({ delay: null });

    await user.type(await screen.findByLabelText('Email'), 'ahtsham@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Everything worth remembering' })).toBeInTheDocument();

    // outlast the bootstrap request, then check we were not thrown back out
    await new Promise((resolve) => setTimeout(resolve, 1800));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Everything worth remembering' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('signs out when the bootstrap check answers 401 and nothing else happened', async () => {
    stubApi({
      'GET /api/auth/me': {
        status: 401,
        body: { error: { message: 'Authentication required' } },
        delayMs: 50,
      },
    });

    renderApp('/');

    // the ordinary case still has to work - the guard waits for the answer and
    // then sends an anonymous visitor to the log-in screen
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});
