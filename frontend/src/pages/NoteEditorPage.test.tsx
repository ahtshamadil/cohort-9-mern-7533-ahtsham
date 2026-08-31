import { screen } from '@testing-library/react';
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

/**
 * What the stub was last called with, for checking a request body.
 *
 * The last rather than the first: editing restarts a one second autosave on
 * every keystroke, so a slow enough machine lets one fire part way through
 * typing. Reading the first call then asserts against that half-typed save
 * instead of the one the test asked for.
 */
function bodyOf(key: string): unknown {
  const calls = (globalThis.fetch as jest.Mock).mock.calls;
  const match = [...calls]
    .reverse()
    .find(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}` === key);

  return JSON.parse(String(match?.[1]?.body));
}

describe('NoteEditorPage', () => {
  afterEach(restoreFetch);

  it('loads the note it was asked for', async () => {
    stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note } } });

    renderApp('/notes/1');

    expect(await screen.findByDisplayValue('Shopping')).toBeInTheDocument();
    expect(screen.getByText('Milk and bread')).toBeInTheDocument();
  });

  it('sends only what changed when saving', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': { status: 200, body: { note: { ...note, title: 'Groceries' } } },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodyOf('PATCH /api/notes/1')).toMatchObject({ title: 'Groceries' });
  });

  it('marks unsaved changes the moment they are made', async () => {
    stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note } } });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('saves on its own once the typing stops', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': { status: 200, body: { note } },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');

    // nobody pressed Save - the debounce did it
    await screen.findByText('Saved', undefined, { timeout: 4000 });
    expect(bodyOf('PATCH /api/notes/1')).toMatchObject({ title: 'Shopping!' });
  });

  it('says so and keeps the text when an automatic save fails', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': { status: 0, networkError: true },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');

    expect(await screen.findByRole('alert', undefined, { timeout: 4000 })).toHaveTextContent(
      'Could not save',
    );
    expect(screen.getByText('Not saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping!');
  });

  it('does not create a new note behind your back', async () => {
    stubApi({ ...signedIn, 'POST /api/notes': { status: 201, body: { note } } });

    renderApp('/notes/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), 'Half a thought');

    // well past the debounce a saved note would have used
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const posts = (globalThis.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('creates a new note and moves to its own address', async () => {
    stubApi({
      ...signedIn,
      'POST /api/notes': { status: 201, body: { note: { ...note, id: 7, title: 'Fresh' } } },
      'GET /api/notes/7': { status: 200, body: { note: { ...note, id: 7, title: 'Fresh' } } },
    });

    renderApp('/notes/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), 'Fresh');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByDisplayValue('Fresh')).toBeInTheDocument();
    expect(bodyOf('POST /api/notes')).toMatchObject({ title: 'Fresh' });
  });

  it('shows what the API objected to', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': {
        status: 400,
        body: {
          error: {
            message: 'Validation failed',
            details: [{ field: 'title', message: 'Title is required' }],
          },
        },
      },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText('Title'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  it('asks before deleting, then goes back to the list', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'DELETE /api/notes/1': { status: 204 },
      'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    // nothing is gone until the second click
    expect(screen.getByText('Delete this note?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByRole('heading', { name: 'A clean slate' })).toBeInTheDocument();
  });

  it('keeps the note when the delete is called off', async () => {
    stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note } } });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(screen.getByDisplayValue('Shopping')).toBeInTheDocument();
    expect(screen.queryByText('Delete this note?')).not.toBeInTheDocument();
  });

  it('stays on the page when leaving would lose a failed save', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': { status: 0, networkError: true },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');
    await screen.findByText('Not saved', undefined, { timeout: 4000 });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    // still here, still holding the text, rather than back at the list with it gone
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping!');
    expect(screen.queryByRole('heading', { name: 'Everything worth remembering' })).toBeNull();
  });

  it('goes back once the pending save has gone up', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes/1': { status: 200, body: { note } },
      'PATCH /api/notes/1': { status: 200, body: { note } },
      'GET /api/notes': { status: 200, body: { notes: [note], total: 1 } },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Everything worth remembering' }),
    ).toBeInTheDocument();
  });

  describe('a note somebody else owns', () => {
    const theirs = {
      ...note,
      owner: { id: 2, email: 'someone@example.com', name: 'Sam' },
    };

    const viewOnly = { ...theirs, permission: 'view' as const };
    const canWrite = { ...theirs, permission: 'edit' as const };

    it('shows a view-only note as text rather than as a form', async () => {
      stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note: viewOnly } } });

      renderApp('/notes/1');

      expect(await screen.findByRole('heading', { name: 'Shopping' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.getByText('Milk and bread')).toBeInTheDocument();
    });

    it('says view only where the save status would be', async () => {
      stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note: viewOnly } } });

      renderApp('/notes/1');

      expect(await screen.findByText('View only')).toBeInTheDocument();
    });

    it('offers nothing that would write to it', async () => {
      stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note: viewOnly } } });

      renderApp('/notes/1');
      await screen.findByRole('heading', { name: 'Shopping' });

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      // the toolbar would only format text that cannot be saved
      expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument();
    });

    it('leaves the note alone when a view-only reader goes back', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes/1': { status: 200, body: { note: viewOnly } },
        'GET /api/notes': { status: 200, body: { notes: [], total: 0 } },
      });

      renderApp('/notes/1');
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Shopping' });

      // a PATCH here has no stub, so a save on the way out would reject
      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(await screen.findByRole('tab', { name: 'Your notes' })).toBeInTheDocument();
    });

    it('lets an edit share save, but not share it on or delete it', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes/1': { status: 200, body: { note: canWrite } },
        'PATCH /api/notes/1': { status: 200, body: { note: { ...canWrite, title: 'Groceries' } } },
      });

      renderApp('/notes/1');
      const user = userEvent.setup();

      expect(await screen.findByDisplayValue('Shopping')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Groceries');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Saved')).toBeInTheDocument();
    });
  });

  describe('sharing a note you own', () => {
    it('offers Share on a note that exists', async () => {
      stubApi({ ...signedIn, 'GET /api/notes/1': { status: 200, body: { note } } });

      renderApp('/notes/1');

      expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    });

    it('does not offer it before the note has been saved once', async () => {
      stubApi(signedIn);

      renderApp('/notes/new');

      expect(await screen.findByLabelText('Title')).toBeInTheDocument();
      // there is no id to share yet, and no note on the server to share either
      expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    });

    it('opens the dialog with who it is already shared with', async () => {
      stubApi({
        ...signedIn,
        'GET /api/notes/1': { status: 200, body: { note } },
        'GET /api/notes/1/shares': {
          status: 200,
          body: {
            shares: [
              {
                user: { id: 2, email: 'someone@example.com', name: null },
                permission: 'view',
                createdAt: '2026-08-05T00:00:00.000Z',
              },
            ],
          },
        },
      });

      renderApp('/notes/1');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Share' }));

      expect(await screen.findByRole('dialog', { name: 'Share this note' })).toBeInTheDocument();
      expect(await screen.findByText('someone@example.com')).toBeInTheDocument();
    });
  });
});
