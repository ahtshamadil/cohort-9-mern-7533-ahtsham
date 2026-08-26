import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';

const signedIn = { 'GET /api/auth/me': { status: 200, body: { user: testUser } } };

const note = {
  id: 1,
  title: 'Shopping',
  content: '<p>Milk and bread</p>',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  owner: { id: 1, email: 'ahtsham@example.com', name: null },
  permission: 'owner' as const,
};

const other = {
  id: 2,
  title: 'Ideas',
  content: '<p>A better mousetrap</p>',
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  owner: { id: 1, email: 'ahtsham@example.com', name: null },
  permission: 'owner' as const,
};

const both = { status: 200, body: { notes: [note, other], total: 2 } };

describe('DashboardPage', () => {
  afterEach(() => {
    restoreFetch();
    jest.restoreAllMocks();
  });

  it('lists the notes it gets back', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } } });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
  });

  it('shows the body as text rather than as markup', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } } });

    renderApp('/');

    // the tags are stripped, so the text is there and the markup is not
    expect(await screen.findByText('Milk and bread')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('&lt;p&gt;');
  });

  it('offers a clean slate when there are none', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [], total: 0 } } });

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
      'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } },
      'GET /api/notes/1': { status: 200, body: { note } },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: /Shopping/ }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping');
  });

  it('links to a blank editor for a new note', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [], total: 0 } } });

    renderApp('/');

    expect(await screen.findByRole('link', { name: 'New note' })).toHaveAttribute(
      'href',
      '/notes/new',
    );
  });

  it('says so and stays put when logging out fails', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
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
    expect(screen.getByRole('heading', { name: 'Everything worth remembering' })).toBeInTheDocument();
  });

  it('returns to the log-in screen after logging out', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
      'POST /api/auth/logout': { status: 204 },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('searches for what was typed', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'GET /api/notes?q=milk': { status: 200, body: { notes: [note], total: 1 } },
    });

    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Ideas' });

    // pasted rather than typed, so the debounce sees one change and the stub is
    // not asked for every prefix of the word
    await user.click(screen.getByLabelText('Search notes'));
    await user.paste('milk');

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Ideas' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'GET /api/notes?q=zzz': { status: 200, body: { notes: [], total: 0 } },
    });

    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Ideas' });

    await user.click(screen.getByLabelText('Search notes'));
    await user.paste('zzz');

    // a clean slate would be wrong here - the account is not empty, the search missed
    expect(await screen.findByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'A clean slate' })).not.toBeInTheDocument();
  });

  it('asks for a different order when one is chosen', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'GET /api/notes?sort=title': { status: 200, body: { notes: [other], total: 1 } },
    });

    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Shopping' });

    await user.selectOptions(screen.getByLabelText('Sort notes'), 'title');

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Shopping' })).not.toBeInTheDocument();
    });
  });

  it('downloads an export under the name the server gave it', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'GET /api/notes/export': {
        status: 200,
        body: { version: 1, notes: [] },
        headers: { 'Content-Disposition': 'attachment; filename="slate-notes-2026-08-24.json"' },
      },
    });

    // jsdom implements neither, and the download is the only thing that uses them
    URL.createObjectURL = jest.fn(() => 'blob:slate');
    URL.revokeObjectURL = jest.fn();

    const saved: string[] = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /JSON/ }));

    await waitFor(() => expect(saved).toEqual(['slate-notes-2026-08-24.json']));
  });

  it('reads the filename however the header is cased', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'GET /api/notes/export': {
        status: 200,
        body: { version: 1, notes: [] },
        // servers send this lowercased, and Headers.get ignores case
        headers: { 'content-disposition': 'attachment; filename="slate-notes-2026-01-02.json"' },
      },
    });

    URL.createObjectURL = jest.fn(() => 'blob:slate');
    URL.revokeObjectURL = jest.fn();

    const saved: string[] = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /JSON/ }));

    await waitFor(() => expect(saved).toEqual(['slate-notes-2026-01-02.json']));
  });

  it('downloads a text copy built from every note', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': both });

    const files: Blob[] = [];
    URL.createObjectURL = jest.fn((blob: Blob) => {
      files.push(blob);
      return 'blob:slate';
    });
    URL.revokeObjectURL = jest.fn();

    const saved: string[] = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /Plain text/ }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatch(/^slate-notes-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(files[0].type).toBe('text/plain');
  });

  it('says how many notes an import brought in', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'POST /api/notes/import': { status: 201, body: { imported: 2 } },
    });

    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Ideas' });

    const file = new File([JSON.stringify({ version: 1, notes: [] })], 'slate-notes.json', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Import JSON'), file);

    expect(await screen.findByText('Imported 2 notes.')).toBeInTheDocument();
  });

  it('turns away a file that is not a json export', async () => {
    stubApi({ ...signedIn, 'GET /api/notes': both });

    renderApp('/');
    // userEvent honours the accept attribute and would drop this file without a
    // word - that is the picker's own filter working. turning it off is what a
    // person switching the picker to "all files" does
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByRole('heading', { name: 'Ideas' });

    const file = new File(['not json at all'], 'notes.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Import JSON'), file);

    const alerts = await screen.findAllByRole('alert');
    expect(within(alerts[0]).getByText(/needs a .json export file/)).toBeInTheDocument();
  });

  it('reports what the API objected to in an import file', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes': both,
      'POST /api/notes/import': {
        status: 400,
        body: { error: { message: 'Unsupported export version' } },
      },
    });

    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Ideas' });

    const file = new File(['{"version":2,"notes":[]}'], 'old.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import JSON'), file);

    const alerts = await screen.findAllByRole('alert');
    expect(within(alerts[0]).getByText(/Unsupported export version/)).toBeInTheDocument();
  });

  describe('the shared list', () => {
    const theirs = {
      id: 9,
      title: 'Rota',
      content: '<p>Tuesday is yours</p>',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
      owner: { id: 2, email: 'someone@example.com', name: 'Sam' },
      permission: 'view' as const,
    };

    const shared = { status: 200, body: { notes: [theirs], total: 1 } };

    it('starts on your own notes rather than the shared ones', async () => {
      stubApi({ ...signedIn, 'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } } });

      renderApp('/');

      expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Your notes' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('asks the shared route once that tab is chosen', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } },
        'GET /api/notes/shared': shared,
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Shopping' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      expect(await screen.findByRole('heading', { name: 'Rota' })).toBeInTheDocument();
      // the previous list is gone rather than showing under the other tab
      expect(screen.queryByRole('heading', { name: 'Shopping' })).not.toBeInTheDocument();
    });

    it('says whose note it is and that it cannot be changed', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared': shared,
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      const card = await screen.findByRole('heading', { name: 'Rota' });
      expect(within(card.closest('a') as HTMLElement).getByText(/Sam/)).toBeInTheDocument();
      expect(within(card.closest('a') as HTMLElement).getByText(/view only/)).toBeInTheDocument();
    });

    it('does not offer export or import over notes you do not own', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared': shared,
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));
      await screen.findByRole('heading', { name: 'Rota' });

      expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Import JSON')).not.toBeInTheDocument();
    });

    it('says nothing is shared rather than showing the empty slate', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared': { status: 200, body: { notes: [], total: 0 } },
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    });

    it('searches the shared list rather than your own', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared': shared,
        'GET /api/notes/shared?q=rota': shared,
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));
      await screen.findByRole('heading', { name: 'Rota' });

      // a stub the search did not match would reject, so arriving is the assertion
      await user.type(screen.getByLabelText('Search notes'), 'rota');

      expect(await screen.findByRole('heading', { name: 'Rota' })).toBeInTheDocument();
    });
  });
});
