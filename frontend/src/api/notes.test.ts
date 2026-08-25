import { restoreFetch, stubApi } from '../test/harness';
import { listNotes, notesToText, plainText, type Note } from './notes';

// the stub rejects any key it was not given, so a wrong url fails as a rejection
// rather than needing a spy on fetch to assert against
describe('listNotes', () => {
  afterEach(restoreFetch);

  it('asks for nothing extra when nothing is asked for', async () => {
    stubApi({ 'GET /api/notes': { status: 200, body: { notes: [] } } });

    await expect(listNotes()).resolves.toEqual([]);
  });

  it('leaves out a blank search and the default sort', async () => {
    stubApi({ 'GET /api/notes': { status: 200, body: { notes: [] } } });

    await expect(listNotes({ q: '   ', sort: 'recent' })).resolves.toEqual([]);
  });

  it('sends the search and the sort when they are asked for', async () => {
    stubApi({ 'GET /api/notes?q=milk&sort=title': { status: 200, body: { notes: [] } } });

    await expect(listNotes({ q: ' milk ', sort: 'title' })).resolves.toEqual([]);
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
