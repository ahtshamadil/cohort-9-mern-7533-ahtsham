import { socketId } from '../realtime/socket';
import { restoreFetch, stubApi } from '../test/harness';
import {
  canEdit,
  listSharedNotes,
  listShares,
  listNotes,
  notesToText,
  plainText,
  shareNote,
  unshareNote,
  updateNote,
  type Note,
} from './notes';

jest.mock('../realtime/socket', () => ({ socketId: jest.fn() }));

const connected = socketId as jest.MockedFunction<typeof socketId>;

// the stub rejects any key it was not given, so a wrong url fails as a rejection
// rather than needing a spy on fetch to assert against
describe('listNotes', () => {
  afterEach(restoreFetch);

  it('asks for nothing extra when nothing is asked for', async () => {
    stubApi({ 'GET /api/notes': { status: 200, body: { notes: [], total: 0 } } });

    await expect(listNotes()).resolves.toEqual({ notes: [], total: 0 });
  });

  it('leaves out a blank search and the default sort', async () => {
    stubApi({ 'GET /api/notes': { status: 200, body: { notes: [], total: 0 } } });

    await expect(listNotes({ q: '   ', sort: 'recent' })).resolves.toEqual({
      notes: [],
      total: 0,
    });
  });

  it('sends the search and the sort when they are asked for', async () => {
    stubApi({ 'GET /api/notes?q=milk&sort=title': { status: 200, body: { notes: [], total: 0 } } });

    await expect(listNotes({ q: ' milk ', sort: 'title' })).resolves.toEqual({
      notes: [],
      total: 0,
    });
  });

  it('asks for one page at a time when a page and a size are given', async () => {
    stubApi({ 'GET /api/notes?page=2&limit=20': { status: 200, body: { notes: [], total: 45 } } });

    await expect(listNotes({ page: 2, limit: 20 })).resolves.toEqual({ notes: [], total: 45 });
  });

  it('asks for no page at all unless both are given', async () => {
    // the API turns paging on the moment it sees either, and a page without a
    // size would be a page of whatever the server picked rather than of 20
    stubApi({ 'GET /api/notes': { status: 200, body: { notes: [], total: 0 } } });

    await expect(listNotes({ page: 2 })).resolves.toEqual({ notes: [], total: 0 });
    await expect(listNotes({ limit: 20 })).resolves.toEqual({ notes: [], total: 0 });
  });

  it('keeps the search alongside the page', async () => {
    stubApi({
      'GET /api/notes?q=milk&page=2&limit=20': { status: 200, body: { notes: [], total: 45 } },
    });

    await expect(listNotes({ q: 'milk', page: 2, limit: 20 })).resolves.toEqual({
      notes: [],
      total: 45,
    });
  });
});

describe('listSharedNotes', () => {
  afterEach(restoreFetch);

  it('asks the shared route rather than the owned one', async () => {
    stubApi({ 'GET /api/notes/shared': { status: 200, body: { notes: [], total: 0 } } });

    await expect(listSharedNotes()).resolves.toEqual({ notes: [], total: 0 });
  });

  it('carries the search and the sort across to it', async () => {
    stubApi({
      'GET /api/notes/shared?q=milk&sort=title': { status: 200, body: { notes: [], total: 0 } },
    });

    await expect(listSharedNotes({ q: 'milk', sort: 'title' })).resolves.toEqual({
      notes: [],
      total: 0,
    });
  });
});

describe('updateNote', () => {
  afterEach(restoreFetch);

  const saved = {
    id: 1,
    title: 'Shopping',
    content: '<p>Milk</p>',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    owner: { id: 1, email: 'ahtsham@example.com', name: null },
    permission: 'owner' as const,
  };

  /** What the stub was called with, so the headers can be read back. */
  function sent(): RequestInit {
    return (globalThis.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
  }

  it('names the socket that saved so the server can leave it out', async () => {
    connected.mockReturnValue('abc123');
    stubApi({ 'PATCH /api/notes/1': { status: 200, body: { note: saved } } });

    await updateNote(1, { title: 'Shopping' });

    // without this the save comes straight back as an update and lands on top of
    // whatever has been typed since it went out
    expect(sent().headers).toMatchObject({ 'x-socket-id': 'abc123' });
  });

  it('sends no socket header before there is a socket', async () => {
    connected.mockReturnValue(undefined);
    stubApi({ 'PATCH /api/notes/1': { status: 200, body: { note: saved } } });

    await updateNote(1, { title: 'Shopping' });

    expect(sent().headers).not.toHaveProperty('x-socket-id');
  });
});

describe('the share calls', () => {
  afterEach(restoreFetch);

  const share = {
    user: { id: 2, email: 'someone@example.com', name: null },
    permission: 'view' as const,
    createdAt: '2026-08-05T00:00:00.000Z',
  };

  it('reads who a note is shared with', async () => {
    stubApi({ 'GET /api/notes/1/shares': { status: 200, body: { shares: [share] } } });

    await expect(listShares(1)).resolves.toEqual([share]);
  });

  it('shares a note and hands back the share that was made', async () => {
    stubApi({ 'POST /api/notes/1/shares': { status: 201, body: { share } } });

    await expect(shareNote(1, 'someone@example.com', 'view')).resolves.toEqual(share);
  });

  it('unshares by the user id, and reads nothing from the 204', async () => {
    stubApi({ 'DELETE /api/notes/1/shares/2': { status: 204 } });

    await expect(unshareNote(1, 2)).resolves.toBeUndefined();
  });
});

describe('canEdit', () => {
  const note = {
    id: 1,
    title: 'Shopping',
    content: '',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    owner: { id: 1, email: 'ahtsham@example.com', name: null },
  };

  it('lets an owner and an edit share write', () => {
    expect(canEdit({ ...note, permission: 'owner' })).toBe(true);
    expect(canEdit({ ...note, permission: 'edit' })).toBe(true);
  });

  it('does not let a view share write', () => {
    expect(canEdit({ ...note, permission: 'view' })).toBe(false);
  });
});

describe('plainText', () => {
  it('keeps the words and drops the tags', () => {
    expect(plainText('<p>Milk and bread</p>')).toBe('Milk and bread');
  });

  it('puts a space between blocks instead of running them together', () => {
    const html = '<p>Before leaving</p><ul><li><p>Passport</p></li><li><p>Charger</p></li></ul>';

    expect(plainText(html)).toBe('Before leaving Passport Charger');
  });

  it('counts a list item holding a paragraph once', () => {
    expect(plainText('<ul><li><p>Passport</p></li></ul>')).toBe('Passport');
  });

  it('copes with content that has no blocks at all', () => {
    expect(plainText('just words')).toBe('just words');
  });

  it('ignores the empty trailing paragraph the editor leaves behind', () => {
    expect(plainText('<p>Done</p><p><br></p>')).toBe('Done');
  });
});

describe('notesToText', () => {
  const note: Note = {
    id: 1,
    title: 'Shopping',
    content: '<p>Milk and bread</p><p>Then home</p>',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    owner: { id: 1, email: 'ahtsham@example.com', name: null },
    permission: 'owner',
  };

  it('heads each note with a rule, its title and its date', () => {
    const lines = notesToText([note]).split('\n');

    expect(lines[0]).toBe('-'.repeat(40));
    expect(lines[1]).toBe('Shopping');
    // the date is the reader's own format, so only the year is safe to pin
    expect(lines[2]).toContain('2026');
    expect(lines[3]).toBe('');
  });

  it('keeps paragraphs on their own lines rather than running them together', () => {
    expect(notesToText([note])).toContain('Milk and bread\nThen home');
  });

  it('separates one note from the next', () => {
    const text = notesToText([note, { ...note, id: 2, title: 'Ideas' }]);

    expect(text.match(new RegExp('-'.repeat(40), 'g'))).toHaveLength(2);
    expect(text).toContain('Ideas');
  });

  it('copes with an account that has nothing in it', () => {
    expect(notesToText([])).toBe('');
  });
});
