import { restoreFetch, stubApi } from '../test/harness';
import { listNotes, plainText } from './notes';

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
