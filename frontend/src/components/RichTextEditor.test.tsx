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

  it('offers a toggle for every mark and block the sanitiser allows', async () => {
    render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
    await screen.findByText('Start');

    // each of these writes a tag the API's allow-list already accepts. a button
    // for anything else would lose its formatting the moment the note was saved
    for (const label of [
      'Bold',
      'Italic',
      'Underline',
      'Strike',
      'Code',
      'Bullet list',
      'Numbered list',
      'Quote',
      'Code block',
    ]) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });

  it.each([
    ['Underline', '<u>Start</u>'],
    ['Strike', '<s>Start</s>'],
    ['Code', '<code>Start</code>'],
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

  it('changes the block to the heading level the style select asks for', async () => {
    const changes: string[] = [];
    render(<RichTextEditor content="<p>Start</p>" onChange={(html) => changes.push(html)} />);
    const user = userEvent.setup();

    const style = await screen.findByRole('combobox', { name: 'Text style' });
    expect(style).toHaveValue('0');

    await user.selectOptions(style, '3');

    expect(changes.at(-1)).toContain('<h3>Start</h3>');
    expect(style).toHaveValue('3');

    await user.selectOptions(style, '0');

    expect(changes.at(-1)).toContain('<p>Start</p>');
  });

  it('enables undo only once there is something to undo', async () => {
    render(<RichTextEditor content="<p>Start</p>" onChange={() => {}} />);
    const user = userEvent.setup();

    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();

    // focus through the text rather than through a toolbar button. the button's
    // own focus() is part of the same click, and whether it has landed by the
    // time the keystroke arrives is not something to rely on
    await user.click(await screen.findByText('Start'));
    await user.keyboard('!');

    expect(undo).toBeEnabled();
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
