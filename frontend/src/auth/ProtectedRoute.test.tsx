import { screen } from '@testing-library/react';

import {
  renderApp,
  restoreFetch,
  stubApi,
  stubApiPending,
  testUser,
} from '../test/harness';

describe('ProtectedRoute', () => {
  afterEach(restoreFetch);

  it('sends a visitor who is not signed in to the log-in screen', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
    });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('lets a signed-in visitor through', async () => {
    stubApi({
      'GET /api/auth/me': { status: 200, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
    });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Everything worth remembering' })).toBeInTheDocument();
  });

  it('renders nothing while the session check is still in flight', () => {
    // the answer never arrives, which is the moment this test is about
    stubApiPending();

    renderApp('/');

    // no log-in form. treating "not known yet" as "signed out" would flash this
    // screen at a signed-in user on every refresh
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Everything worth remembering' })).not.toBeInTheDocument();
  });
});
