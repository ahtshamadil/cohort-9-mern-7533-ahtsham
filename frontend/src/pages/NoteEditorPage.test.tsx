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
      'GET /api/notes': { status: 200, body: { notes: [] } },
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
      'GET /api/notes': { status: 200, body: { notes: [note] } },
    });

    renderApp('/notes/1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Everything worth remembering' }),
    ).toBeInTheDocument();
  });
});
