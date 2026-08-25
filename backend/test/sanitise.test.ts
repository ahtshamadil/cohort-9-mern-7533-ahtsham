import { expect } from 'chai';

import { sanitiseHtml } from '../src/utils/sanitiseHtml.js';

describe('sanitiseHtml', () => {
  describe('what it takes out', () => {
    it('drops a script and the code inside it', () => {
      expect(sanitiseHtml('<p>hi</p><script>alert(1)</script>')).to.equal('<p>hi</p>');
    });

    it('drops an event handler and keeps the paragraph', () => {
      expect(sanitiseHtml('<p onclick="alert(1)">hi</p>')).to.equal('<p>hi</p>');
    });

    it('drops an image, which the editor cannot write', () => {
      expect(sanitiseHtml('<img src=x onerror=alert(1)>')).to.equal('');
    });

    it('drops a javascript href but keeps the words', () => {
      const cleaned = sanitiseHtml('<a href="javascript:alert(1)">click</a>');

      expect(cleaned).to.not.contain('javascript:');
      expect(cleaned).to.not.contain('href');
      expect(cleaned).to.contain('click');
    });

    it('drops an iframe', () => {
      expect(sanitiseHtml('<iframe src="https://example.com"></iframe>')).to.equal('');
    });

    it('drops a style attribute', () => {
      expect(sanitiseHtml('<p style="position:fixed">hi</p>')).to.equal('<p>hi</p>');
    });

    it('drops a class the editor would never write', () => {
      expect(sanitiseHtml('<p class="anything">hi</p>')).to.equal('<p>hi</p>');
    });
  });

  describe('what it keeps', () => {
    it('keeps every heading level, not only the one the toolbar offers', () => {
      const headings = '<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>';

      expect(sanitiseHtml(headings)).to.equal(headings);
    });

    it('keeps the marks the editor can apply', () => {
      const marks = '<p><strong>a</strong><em>b</em><s>c</s><u>d</u><code>e</code></p>';

      expect(sanitiseHtml(marks)).to.equal(marks);
    });

    it('keeps lists, quotes and rules', () => {
      const blocks = '<ul><li>a</li></ul><blockquote><p>b</p></blockquote><hr />';

      expect(sanitiseHtml(blocks)).to.equal(blocks);
    });

    it('keeps where an ordered list starts', () => {
      expect(sanitiseHtml('<ol start="3"><li>a</li></ol>')).to.equal(
        '<ol start="3"><li>a</li></ol>',
      );
    });

    it('keeps the language on a code block', () => {
      const code = '<pre><code class="language-ts">const a = 1;</code></pre>';

      expect(sanitiseHtml(code)).to.equal(code);
    });

    it('keeps a real link, with the attributes the editor gives it', () => {
      const link = '<a href="https://example.com" target="_blank" rel="noopener">go</a>';
      const cleaned = sanitiseHtml(link);

      expect(cleaned).to.contain('href="https://example.com"');
      expect(cleaned).to.contain('target="_blank"');
    });

    it('puts rel back on a link that arrived without one', () => {
      expect(sanitiseHtml('<a href="https://example.com">go</a>')).to.contain(
        'rel="noopener noreferrer nofollow"',
      );
    });

    it('leaves an empty body empty', () => {
      expect(sanitiseHtml('')).to.equal('');
    });
  });
});
