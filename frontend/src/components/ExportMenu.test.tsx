import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExportMenu } from './ExportMenu';

describe('ExportMenu', () => {
  it('keeps the formats out of the way until asked', () => {
    render(<ExportMenu onChoose={jest.fn()} />);

    expect(screen.getByRole('button', { name: /Export/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('says which format each one is for', async () => {
    render(<ExportMenu onChoose={jest.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Export/ }));

    // the reason the menu exists rather than two toolbar buttons
    expect(screen.getByText('Keeps formatting. Import reads this one.')).toBeInTheDocument();
    expect(screen.getByText('A readable copy. Formatting is lost.')).toBeInTheDocument();
  });

  it('reports the format that was chosen and closes', async () => {
    const chosen = jest.fn();
    render(<ExportMenu onChoose={chosen} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('menuitem', { name: /Plain text/ }));

    expect(chosen).toHaveBeenCalledWith('text');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on escape and hands focus back to the button', async () => {
    render(<ExportMenu onChoose={jest.fn()} />);
    const user = userEvent.setup();

    const trigger = screen.getByRole('button', { name: /Export/ });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // leaving focus on the removed item would send a keyboard user back to the
    // top of the page to get anywhere
    expect(trigger).toHaveFocus();
  });

  it('closes when the click lands somewhere else', async () => {
    render(
      <div>
        <ExportMenu onChoose={jest.fn()} />
        <button type="button">Elsewhere</button>
      </div>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Export/ }));
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('cannot be opened while an export is already running', async () => {
    render(<ExportMenu disabled onChoose={jest.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Export/ }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
