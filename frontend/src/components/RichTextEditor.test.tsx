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
