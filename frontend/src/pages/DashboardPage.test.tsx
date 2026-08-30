import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';
import { server } from '../test/realtime';

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
    server.reset();
    jest.restoreAllMocks();
  });

  it('lists the notes it gets back', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } } });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
  });

  it('shows the body as text rather than as markup', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } } });

    renderApp('/');

    // the tags are stripped, so the text is there and the markup is not
    expect(await screen.findByText('Milk and bread')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('&lt;p&gt;');
  });

  it('offers a clean slate when there are none', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } } });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'A clean slate' })).toBeInTheDocument();
  });

  it('says so when the notes cannot be loaded', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 0, networkError: true } });

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your notes');
  });

  it('opens a note when its card is clicked', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } },
      'GET /api/notes/1': { status: 200, body: { note } },
    });

    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: /Shopping/ }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping');
  });

  it('links to a blank editor for a new note', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } } });

    renderApp('/');

    expect(await screen.findByRole('link', { name: 'New note' })).toHaveAttribute(
      'href',
      '/notes/new',
    );
  });

  it('says so and stays put when logging out fails', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
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
      'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
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
      'GET /api/notes?page=1&limit=20': both,
      'GET /api/notes?q=milk&page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } },
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
      'GET /api/notes?page=1&limit=20': both,
      'GET /api/notes?q=zzz&page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
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
      'GET /api/notes?page=1&limit=20': both,
      'GET /api/notes?sort=title&page=1&limit=20': { status: 200, body: { notes: [other], total: 1 } },
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
      'GET /api/notes?page=1&limit=20': both,
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
      'GET /api/notes?page=1&limit=20': both,
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
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': both,
      // the text export asks for the list unpaged on purpose - it is every note,
      // not whatever page the dashboard happens to be showing
      'GET /api/notes': both,
    });

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
      'GET /api/notes?page=1&limit=20': both,
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
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': both });

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
      'GET /api/notes?page=1&limit=20': both,
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

  describe('paging', () => {
    // the API answers with the whole count rather than the page's, which is what
    // lets the dashboard say how far through the list it is
    const firstPage = { status: 200, body: { notes: [note], total: 45 } };
    const secondPage = { status: 200, body: { notes: [other], total: 45 } };

    it('draws no pager when every note fits on one page', async () => {
      stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': both });

      renderApp('/');

      await screen.findByRole('heading', { name: 'Shopping' });
      expect(
        screen.queryByRole('navigation', { name: 'Pages of notes' }),
      ).not.toBeInTheDocument();
    });

    it('asks for the next page when Next is clicked', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': firstPage,
        'GET /api/notes?page=2&limit=20': secondPage,
      });

      renderApp('/');
      const user = userEvent.setup();

      expect(await screen.findByText('Page 1 of 3 - 45 notes')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(await screen.findByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
      expect(screen.getByText('Page 2 of 3 - 45 notes')).toBeInTheDocument();
    });

    it('offers no page before the first or after the last', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': firstPage,
        'GET /api/notes?page=2&limit=20': secondPage,
        'GET /api/notes?page=3&limit=20': { status: 200, body: { notes: [note], total: 45 } },
      });

      renderApp('/');
      const user = userEvent.setup();

      await screen.findByText('Page 1 of 3 - 45 notes');
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(await screen.findByRole('button', { name: 'Next' }));

      await screen.findByText('Page 3 of 3 - 45 notes');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    });

    it('goes back to the first page when the search changes', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': firstPage,
        'GET /api/notes?page=2&limit=20': secondPage,
        // page 2 of the old list means nothing in the new one, and asking for it
        // would answer with no stub here rather than quietly with the wrong notes
        'GET /api/notes?q=milk&page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } },
      });

      renderApp('/');
      const user = userEvent.setup();

      await screen.findByText('Page 1 of 3 - 45 notes');
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Page 2 of 3 - 45 notes');

      await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'milk');

      expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Pages of notes' }),
      ).not.toBeInTheDocument();
    });

    it('steps back rather than showing an empty page past the end', async () => {
      // a note deleted off the last page shrinks the total under whatever page
      // number is being shown, which would otherwise look like an empty account
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': firstPage,
        'GET /api/notes?page=2&limit=20': { status: 200, body: { notes: [], total: 12 } },
      });

      renderApp('/');
      const user = userEvent.setup();

      await screen.findByText('Page 1 of 3 - 45 notes');
      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
    });
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

    it('names what it is loading on whichever list is open', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': both,
        'GET /api/notes/shared?page=1&limit=20': { ...shared, delayMs: 300 },
      });

      renderApp('/');
      const user = userEvent.setup();

      await screen.findByRole('heading', { name: 'Shopping' });
      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      // the two lists were written at different times and said the same thing
      // while waiting, which was only ever right for one of them
      expect(screen.getByText('Loading the notes shared with you...')).toBeInTheDocument();
    });

    it('picks up a note the moment it is shared', async () => {
      let sharedNotes: unknown = { notes: [], total: 0 };

      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': {
          status: 200,
          // read when the request is answered rather than when it is stubbed, so
          // the second ask sees what the share left behind
          get body() {
            return sharedNotes;
          },
        },
      });

      renderApp('/');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('tab', { name: 'Shared with you' }));
      await screen.findByRole('heading', { name: 'Nothing shared yet' });

      sharedNotes = { notes: [theirs], total: 1 };
      server.shareChanged(theirs.id);

      expect(await screen.findByRole('heading', { name: 'Rota' })).toBeInTheDocument();
    });

    it('drops a note the moment the share is taken back', async () => {
      let sharedNotes: unknown = { notes: [theirs], total: 1 };

      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': {
          status: 200,
          get body() {
            return sharedNotes;
          },
        },
      });

      renderApp('/');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('tab', { name: 'Shared with you' }));
      await screen.findByRole('heading', { name: 'Rota' });

      sharedNotes = { notes: [], total: 0 };
      server.shareChanged(theirs.id);

      expect(
        await screen.findByRole('heading', { name: 'Nothing shared yet' }),
      ).toBeInTheDocument();
    });

    it('starts on your own notes rather than the shared ones', async () => {
      stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } } });

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
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [note], total: 1 } },
        'GET /api/notes/shared?page=1&limit=20': shared,
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
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': shared,
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
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': shared,
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
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      expect(await screen.findByText('Nothing shared yet')).toBeInTheDocument();
    });

    it('does not blame the shared list for a failure on your own', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': { status: 0, networkError: true },
        'GET /api/notes/shared?page=1&limit=20': { ...shared, delayMs: 300 },
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('alert');

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));

      // the shared list is still in flight, so nothing about it has failed yet
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Rota' })).toBeInTheDocument();
    });

    it('searches the shared list rather than your own', async () => {
      const match = { ...theirs, id: 10, title: 'Rota changes' };

      stubApi({
        ...signedIn,
        'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
        'GET /api/notes/shared?page=1&limit=20': shared,
        'GET /api/notes/shared?q=rota&page=1&limit=20': { status: 200, body: { notes: [match], total: 1 } },
      });

      renderApp('/');
      const user = userEvent.setup();
      await screen.findByRole('tab', { name: 'Shared with you' });

      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));
      await screen.findByRole('heading', { name: 'Rota' });

      await user.type(screen.getByLabelText('Search notes'), 'rota');

      // only the shared search answers with this note, so finding it is the assertion
      expect(await screen.findByRole('heading', { name: 'Rota changes' })).toBeInTheDocument();
    });
  });
});
