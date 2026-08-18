import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

const signedIn = { 'GET /api/auth/me': { status: 200, body: { user: testUser } } };

const note = {
  id: 1,
  title: 'Shopping',
  content: '<p>Milk and bread</p>',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};

describe('DashboardPage', () => {
  afterEach(restoreFetch);

  it('lists the notes it gets back', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [note] } } });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
  });

  it('shows the body as text rather than as markup', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [note] } } });

    renderApp('/');

    // the tags are stripped, so the text is there and the markup is not
    expect(await screen.findByText('Milk and bread')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('&lt;p&gt;');
  });

  it('offers a clean slate when there are none', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [] } } });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'A clean slate' })).toBeInTheDocument();
  });

  it('says so when the notes cannot be loaded', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 0, networkError: true } });

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your notes');
  });

  it('opens a note when its card is clicked', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': { status: 200, body: { notes: [note] } },
      'GET /api/notes/1': { status: 200, body: { note } },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: /Shopping/ }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping');
  });

  it('links to a blank editor for a new note', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [] } } });

    renderApp('/');

    expect(await screen.findByRole('link', { name: 'New note' })).toHaveAttribute(
      'href',
      '/notes/new',
    );
  });

  it('says so and stays put when logging out fails', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': { status: 200, body: { notes: [] } },
      // the server is unreachable, so the cookie is still sitting there and the
      // session is still live. navigating away would tell somebody on a shared
      // machine they had signed out when they had not
      'POST /api/auth/logout': { status: 0, networkError: true },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    const alerts = await screen.findAllByRole('alert');
    expect(within(alerts[0]).getByText(/Could not log out/)).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
  });

  it('returns to the log-in screen after logging out', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': { status: 200, body: { notes: [] } },
      'POST /api/auth/logout': { status: 204 },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});
