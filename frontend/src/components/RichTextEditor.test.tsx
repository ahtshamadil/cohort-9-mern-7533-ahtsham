import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RichTextEditor } from './RichTextEditor';

describe('RichTextEditor', () => {
  it('renders the toolbar and the content it was given', async () => {
    render(<RichTextEditor content="<p>Hello there</p>" onChange={() => {}} />);

    expect(await screen.findByText('Hello there')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  });

  it('reports the html back as it is typed into', async () => {
    const changes: string[] = [];
    render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Start'));
    await user.keyboard('!!');

    // jsdom has no layout, so a click does not place the caret where it would in
    // a browser. what matters here is that typing reports html back at all
    expect(changes.at(-1)).toContain('!!');
    expect(changes.at(-1)).toContain('Start');
  });

  it('turns a formatting button on when its mark is active', async () => {
    render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
    const user = userEvent.setup();

    const bold = await screen.findByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    await user.click(bold);

    expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  it('drops markup the schema does not allow', async () => {
    const changes: string[] = [];
    render(
      <RichTextEditor
        content="<p>Safe</p><script>alert(1)</script>"
        onChange={(html) => changes.push(html)}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByText('Safe'));
    await user.keyboard('!');

    // prosemirror parses content against its schema rather than injecting it,
    // so a script tag never survives the round trip
    expect(changes.at(-1)).not.toContain('script');
    expect(document.body.innerHTML).not.toContain('<script>');
  });

  it('swaps in new content when a different note is shown', async () => {
    const { rerender } = render(<RichTextEditor content="<p>Note one</p>" onChange={() => {}} />);
    expect(await screen.findByText('Note one')).toBeInTheDocument();

    rerender(<RichTextEditor content="<p>Note two</p>" onChange={() => {}} />);

    expect(await screen.findByText('Note two')).toBeInTheDocument();
    expect(screen.queryByText('Note one')).not.toBeInTheDocument();
  });

  it('does not report a change back when content is swapped in', async () => {
    const changes: string[] = [];
    const { rerender } = render(
      <RichTextEditor content="<p>Note one</p>" onChange={(html) => changes.push(html)} />,
    );
    await screen.findByText('Note one');

    rerender(<RichTextEditor content="<p>Note two</p>" onChange={(html) => changes.push(html)} />);
    await screen.findByText('Note two');

    // an update event here would look like the user editing, and autosave would
    // write the incoming note straight back out again
    expect(changes).toHaveLength(0);
  });

  it('names every icon button, and offers only the trimmed set', async () => {
    render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
    await screen.findByText('Start');

    // the buttons carry an icon and no text, so the name comes from aria-label.
    // getByRole finding them at all is the accessible name being right
    for (const label of [
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Bullet list',
      'Numbered list',
      'Quote',
      'Code block',
      'Align left',
      'Align centre',
      'Align right',
      'Justify',
      'Link',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // dropped on purpose - their shortcuts still work, they just do not earn a
    // place in the row
    for (const gone of ['Divider', 'Undo', 'Redo', 'Code']) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument();
    }

    expect(screen.queryByRole('combobox', { name: 'Text style' })).not.toBeInTheDocument();
  });

  it.each([
    ['Underline', '<u>Start</u>'],
    ['Strikethrough', '<s>Start</s>'],
    ['Quote', '<blockquote><p>Start</p></blockquote>'],
    ['Code block', '<pre><code>Start</code></pre>'],
  ])('writes %s as %s', async (label, markup) => {
    const changes: string[] = [];
    render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
    const user = userEvent.setup();

    // clicking places no caret in jsdom, but it does put the focus in the
    // editor, which is what the select-all below needs
    await user.click(await screen.findByText('Start'));

    // the text is selected before the button is pressed rather than after. a
    // toggle with nothing selected only sets a stored mark, and whether that
    // mark survives to the next keystroke is a race this has already lost once
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: label }));

    expect(changes.at(-1)).toContain(markup);
  });

  it('turns a block into a heading and back off again', async () => {
    const changes: string[] = [];
    render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
    const user = userEvent.setup();

    // a caret in the block rather than a full-document selection. heading is a
    // block toggle, and isActive reads false across a selection spanning the doc
    await user.click(await screen.findByText('Start'));

    const heading = screen.getByRole('button', { name: 'Heading 2' });
    expect(heading).toHaveAttribute('aria-pressed', 'false');

    await user.click(heading);

    expect(changes.at(-1)).toContain('<h2>Start</h2>');
    expect(heading).toHaveAttribute('aria-pressed', 'true');

    await user.click(heading);

    expect(changes.at(-1)).toContain('<p>Start</p>');
  });

  it('keeps the shortcuts for what the toolbar no longer shows', async () => {
    const changes: string[] = [];
    render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Start'));
    await user.keyboard('{Control>}a{/Control}');

    // inline code lost its button, not its keystroke. same for undo on Ctrl+Z
    await user.keyboard('{Control>}e{/Control}');

    expect(changes.at(-1)).toContain('<code>Start</code>');
  });

  describe('the size of a note', () => {
    it('counts the words and characters it was given', async () => {
      render(<RichTextEditor content="<p>Two words</p>" onChange={() => {}} />);

      expect(await screen.findByText('2 words, 9 characters')).toBeInTheDocument();
    });

    it('counts one word without an s on the end', async () => {
      render(<RichTextEditor content="<p>Alone</p>" onChange={() => {}} />);

      expect(await screen.findByText('1 word, 5 characters')).toBeInTheDocument();
    });

    it('counts up as the note is typed into', async () => {
      render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
      const user = userEvent.setup();

      await user.click(await screen.findByText('Start'));
      await user.keyboard('!!');

      expect(await screen.findByText('1 word, 7 characters')).toBeInTheDocument();
    });

    it('warns before a note is too large to save', async () => {
      // the API refuses content past 1,000,000 bytes, and the warning is meant to
      // arrive while there is still something to be done about it. these are three
      // bytes each, so 310,000 of them is a note far shorter than the cap in
      // characters and nearly at it in what actually gets stored
      const long = `<p>${'字'.repeat(310_000)}</p>`;
      render(<RichTextEditor content={long} onChange={() => {}} />);

      expect(await screen.findByRole('status')).toHaveTextContent(
        'nearly as large as one note can be',
      );
    });

    it('says nothing about the size of an ordinary note', async () => {
      render(<RichTextEditor content="<p>Short</p>" onChange={() => {}} />);
      await screen.findByText('1 word, 5 characters');

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('prompts an empty note rather than leaving it blank', async () => {
      const { container } = render(<RichTextEditor content="" onChange={() => {}} />);

      await screen.findByText('0 words, 0 characters');

      expect(container.querySelector('.tiptap p')).toHaveAttribute(
        'data-placeholder',
        'Start writing...',
      );
    });
  });

  describe('alignment', () => {
    it.each([
      ['Align centre', 'center'],
      ['Align right', 'right'],
      ['Justify', 'justify'],
    ])('%s writes text-align:%s', async (label, value) => {
      const changes: string[] = [];
      render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
      const user = userEvent.setup();

      await user.click(await screen.findByText('Start'));
      await user.click(screen.getByRole('button', { name: label }));

      // the value is what the sanitiser matches on. the spacing is not: the
      // editor writes "text-align: center;" and the server stores it back as
      // "text-align:center", and both have to be read as the same thing
      const written = (changes.at(-1) ?? '').replace(/\s*:\s*/g, ':');

      expect(written).toContain(`text-align:${value}`);
    });

    it('shows which alignment the block is on', async () => {
      render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
      const user = userEvent.setup();

      await user.click(await screen.findByText('Start'));

      const centre = screen.getByRole('button', { name: 'Align centre' });
      expect(centre).toHaveAttribute('aria-pressed', 'false');

      await user.click(centre);

      expect(centre).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('reads an alignment back in the form the server stores it', async () => {
      // no space and no semicolon - this is what comes back out of sanitiseHtml,
      // and it is what the editor is handed on every load after the first save
      render(
        <RichTextEditor content='<p style="text-align:right">Start</p>' onChange={() => {}} />,
      );
      await screen.findByText('Start');

      expect(screen.getByRole('button', { name: 'Align right' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  describe('links', () => {
    /** Focuses the editor and selects the whole note, which needs no layout. */
    async function selectAll(user: ReturnType<typeof userEvent.setup>, text: string) {
      await user.click(await screen.findByText(text));
      await user.keyboard('{Control>}a{/Control}');
    }

    it('wraps the selection in a link the toolbar asked for', async () => {
      const changes: string[] = [];
      render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
      const user = userEvent.setup();

      await selectAll(user, 'Start');
      await user.click(screen.getByRole('button', { name: 'Link' }));
      await user.type(screen.getByRole('textbox', { name: 'Link address' }), 'https://example.com');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(changes.at(-1)).toContain('href="https://example.com"');
      expect(screen.queryByRole('textbox', { name: 'Link address' })).not.toBeInTheDocument();
    });

    it('puts https in front of a bare domain', async () => {
      const changes: string[] = [];
      render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
      const user = userEvent.setup();

      await selectAll(user, 'Start');
      await user.click(screen.getByRole('button', { name: 'Link' }));
      await user.type(screen.getByRole('textbox', { name: 'Link address' }), 'example.com');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      // without this it is read as a path on this site rather than another one
      expect(changes.at(-1)).toContain('href="https://example.com"');
    });

    it('refuses an address the sanitiser would drop', async () => {
      const changes: string[] = [];
      render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
      const user = userEvent.setup();

      await selectAll(user, 'Start');
      await user.click(screen.getByRole('button', { name: 'Link' }));
      await user.type(screen.getByRole('textbox', { name: 'Link address' }), 'javascript:alert(1)');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(changes).toHaveLength(0);
      // saying so beats writing a link the server would strip without a word
      expect(screen.getByRole('textbox', { name: 'Link address' })).toBeInTheDocument();
    });

    it('takes a link back off', async () => {
      const changes: string[] = [];
      render(
        <RichTextEditor
          content='<p><a href="https://example.com">Start</a></p>'
          onChange={(html) => changes.push(html)}
        />,
      );
      const user = userEvent.setup();

      await selectAll(user, 'Start');

      const link = screen.getByRole('button', { name: 'Link' });
      expect(link).toHaveAttribute('aria-pressed', 'true');

      await user.click(link);
      await user.click(screen.getByRole('button', { name: 'Remove link' }));

      expect(changes.at(-1)).not.toContain('<a ');
      expect(link).toHaveAttribute('aria-pressed', 'false');
    });

    it('offers no way to remove a link where there is none', async () => {
      render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Link' }));

      expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
    });
  });

  describe('read only', () => {
    it('shows the content without a toolbar', async () => {
      render(<RichTextEditor content="<p>Theirs to read</p>" onChange={() => {}} readOnly />);

      expect(await screen.findByText('Theirs to read')).toBeInTheDocument();
      expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument();
    });

    it('does not let the text be typed into', async () => {
      const changes: string[] = [];
      render(
        <RichTextEditor
          content="<p>Theirs to read</p>"
          onChange={(html) => changes.push(html)}
          readOnly
        />,
      );
      const user = userEvent.setup();

      await user.click(await screen.findByText('Theirs to read'));
      await user.keyboard('!!');

      expect(changes).toHaveLength(0);
    });
  });
});
