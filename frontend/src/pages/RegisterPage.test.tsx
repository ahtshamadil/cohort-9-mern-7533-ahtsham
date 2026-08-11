import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

describe('RegisterPage', () => {
  afterEach(restoreFetch);

  async function signUp() {
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), 'ahtsham@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
  }

  it('creates the account and lands on the dashboard already signed in', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      'POST /api/auth/register': { status: 201, body: { user: testUser } },
      'GET /api/health': { status: 200, body: { status: 'ok', uptime: 1 } },
    });

    renderApp('/register');
    await signUp();

    // registering signs you in, so there is no second trip through the log-in form
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument();
  });

  it('reports an address that is already taken', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
      'POST /api/auth/register': {
        status: 409,
        body: { error: { message: 'That email is already registered' } },
      },
    });

    renderApp('/register');
    await signUp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email is already registered',
    );
  });
});
