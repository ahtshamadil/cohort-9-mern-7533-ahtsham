import sanitizeHtml from 'sanitize-html';

// the blocks the editor can align. a style attribute is allowed nowhere else
const alignable = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// exactly what the editor's extensions can produce. anything else arrived from
// somewhere other than the editor, and a note is read in other people's
// browsers once it is shared
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'em',
    's',
    'u',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    // written when an ordered list does not start at 1, or is not numbered
    ol: ['start', 'type'],
    // the editor writes alignment as an inline style, so these blocks are the
    // only ones allowed to carry one at all
    ...Object.fromEntries(alignable.map((tag) => [tag, ['style']])),
  },
  /**
   * The one property an inline style may set, and the only four values it may
   * hold. Everything else in a style attribute is dropped, so a smuggled
   * position:fixed or background:url(...) does not survive alongside a real
   * alignment.
   */
  allowedStyles: {
    '*': { 'text-align': [/^(?:left|right|center|justify)$/] },
  },
  // the only class the editor writes is the code block's language
  allowedClasses: { code: ['language-*'] },
  transformTags: {
    // a link the editor made carries these already; one that was pasted may not
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
  },
};

/**
 * Note HTML with everything the editor cannot have written taken out.
 *
 * Run on the way in rather than on the way out, so what is stored is what is
 * safe. Sanitising on read would leave the payload in the database for whatever
 * reads it next and forgets.
 */
export function sanitiseHtml(html: string): string {
  return sanitizeHtml(html, options);
}
