import { plainText } from './notes';

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
