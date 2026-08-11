import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

describe('DashboardPage', () => {
  afterEach(restoreFetch);

  it('shows the status reported by the health endpoint', async () => {
    stubApi({
      'GET /api/auth/me': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 12.5 } },
    });

    renderApp('/');

    expect(await screen.findByText('ok')).toBeInTheDocument();
  });

  it('names who is signed in', async () => {
    stubApi({
      'GET /api/auth/me': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
    });

    renderApp('/');

    expect(await screen.findByText(`Signed in as ${testUser.email}`)).toBeInTheDocument();
  });

  it('returns to the log-in screen after logging out', async () => {
    stubApi({
      'GET /api/auth/me': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
      'POST /api/auth/logout': { status: 204 },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
