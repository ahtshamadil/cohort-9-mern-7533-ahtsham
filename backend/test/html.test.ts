import { expect } from 'chai';

import { htmlToText } from '../src/utils/html.js';

describe('htmlToText', () => {
  it('takes the markup out and leaves the words', () => {
    expect(htmlToText('<p>Buy <strong>milk</strong></p>')).to.equal('Buy milk');
  });

  it('keeps one block from running into the next', () => {
    expect(htmlToText('<p>first</p><p>second</p>')).to.equal('first second');
  });

  it('does not leave tag names behind to be searched', () => {
    expect(htmlToText('<ul><li>one</li></ul>')).to.equal('one');
  });

  it('decodes the entities a note can contain', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3</p>')).to.equal('Tom & Jerry <3');
  });

  it('decodes numbered entities', () => {
    expect(htmlToText('<p>caf&#233;</p>')).to.equal('café');
  });

  it('leaves an entity it does not know alone', () => {
    expect(htmlToText('<p>&notreal; here</p>')).to.equal('&notreal; here');
  });

  it('does not decode an escaped ampersand twice', () => {
    expect(htmlToText('<p>&amp;lt;</p>')).to.equal('&lt;');
  });

  it('drops a script body rather than indexing it', () => {
    expect(htmlToText('<p>hi</p><script>alert(1)</script>')).to.equal('hi');
  });

  it('gives an empty string for an empty note', () => {
    expect(htmlToText('')).to.equal('');
    expect(htmlToText('<p></p>')).to.equal('');
  });
});
