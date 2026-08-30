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

    it('drops a style attribute holding anything but an alignment', () => {
      expect(sanitiseHtml('<p style="position:fixed">hi</p>')).to.equal('<p>hi</p>');
    });

    it('drops a property smuggled in beside a real alignment', () => {
      // the whole reason text-align is allowed by value rather than by name
      const smuggled = '<p style="text-align:center;position:fixed;top:0">hi</p>';

      expect(sanitiseHtml(smuggled)).to.equal('<p style="text-align:center">hi</p>');
    });

    it('drops a url payload sitting next to an alignment', () => {
      const payload = '<p style="text-align:left;background:url(javascript:alert(1))">hi</p>';

      expect(sanitiseHtml(payload)).to.not.contain('javascript');
    });

    it('drops an alignment that is not one of the four', () => {
      expect(sanitiseHtml('<p style="text-align:expression(alert(1))">hi</p>')).to.equal(
        '<p>hi</p>',
      );
    });

    it('drops an alignment on a block the editor cannot align', () => {
      // style is allowed on the alignable blocks and nowhere else, so a list
      // item carrying one did not come from the editor
      expect(sanitiseHtml('<li style="text-align:center">hi</li>')).to.contain('<li>hi</li>');
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

    it('keeps an alignment on a paragraph and on a heading', () => {
      const aligned = '<p style="text-align:center">a</p><h2 style="text-align:right">b</h2>';

      expect(sanitiseHtml(aligned)).to.equal(aligned);
    });

    it('keeps each of the four alignments', () => {
      for (const align of ['left', 'right', 'center', 'justify']) {
        expect(sanitiseHtml(`<p style="text-align:${align}">a</p>`)).to.equal(
          `<p style="text-align:${align}">a</p>`,
        );
      }
    });

    it('leaves an empty body empty', () => {
      expect(sanitiseHtml('')).to.equal('');
    });
  });
});
