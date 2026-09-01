import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

const signedIn = {
  'GET /api/auth/me': { status: 200, body: { user: testUser } },
  'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
};

const ok = { 'PATCH /api/auth/password': { status: 204 } };

/** Opens the dialog the way somebody signed in reaches it. */
async function open() {
  await userEvent.click(await screen.findByRole('button', { name: /ahtsham@example.com/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /Change password/ }));
  await screen.findByLabelText('Current password');
}

/** Fills the three boxes and submits. */
async function change(current: string, next: string, again = next) {
  await userEvent.type(screen.getByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('New password again'), again);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordDialog', () => {
  afterEach(() => {
    restoreFetch();
    jest.restoreAllMocks();
  });

  it('is not in the way until the account menu asks for it', async () => {
    stubApi({ ...signedIn });

    renderApp('/');

    await screen.findByRole('button', { name: /ahtsham@example.com/ });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens over the dashboard rather than replacing it', async () => {
    stubApi({ ...signedIn });

    renderApp('/');
    await open();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('warns that the other sessions end before it is used', async () => {
    stubApi({ ...signedIn });

    renderApp('/');
    await open();

    expect(
      screen.getByText(/Everywhere else you are signed in will be signed out/),
    ).toBeInTheDocument();
  });

  it('sends the two passwords', async () => {
    stubApi({ ...signedIn, ...ok });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret');

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auth/password',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            currentPassword: 'the old one',
            newPassword: 'a whole new secret',
          }),
        }),
      );
    });
  });

  it('says it worked, and that the other sessions are gone', async () => {
    stubApi({ ...signedIn, ...ok });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret');

    expect(await screen.findByText('Password changed')).toBeInTheDocument();
  });

  it('closes when it is done with', async () => {
    stubApi({ ...signedIn, ...ok });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret');

    await userEvent.click(await screen.findByRole('button', { name: 'Back to your notes' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on escape without sending anything', async () => {
    stubApi({ ...signedIn, ...ok });

    renderApp('/');
    await open();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/auth/password', expect.anything());
  });

  it('does not send anything when the two do not match', async () => {
    stubApi({ ...signedIn, ...ok });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret', 'a different one');

    expect(await screen.findByText('The two passwords do not match')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/auth/password', expect.anything());
  });

  it('shows what the API objected to, by field', async () => {
    stubApi({
      ...signedIn,
      'PATCH /api/auth/password': {
        status: 400,
        body: {
          error: {
            message: 'Validation failed',
            details: [{ field: 'newPassword', message: 'That password is too common to use' }],
          },
        },
      },
    });

    renderApp('/');
    await open();
    await change('the old one', 'password123');

    expect(await screen.findByText('That password is too common to use')).toBeInTheDocument();
  });

  it('reports a wrong current password', async () => {
    stubApi({
      ...signedIn,
      'PATCH /api/auth/password': {
        status: 401,
        body: { error: { message: 'Current password is incorrect' } },
      },
    });

    renderApp('/');
    await open();
    await change('not the one', 'a whole new secret');

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
  });

  it('passes on the rate limit rather than swallowing it', async () => {
    stubApi({
      ...signedIn,
      'PATCH /api/auth/password': {
        status: 429,
        body: { error: { message: 'Too many attempts. Wait a few minutes and try again.' } },
      },
    });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('says so when the server cannot be reached at all', async () => {
    stubApi({ ...signedIn, 'PATCH /api/auth/password': { status: 0, networkError: true } });

    renderApp('/');
    await open();
    await change('the old one', 'a whole new secret');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('stops a password longer than the API stores', async () => {
    stubApi({ ...signedIn });

    renderApp('/');
    await open();

    expect(screen.getByLabelText('New password')).toHaveAttribute('maxlength', '72');
  });
});
