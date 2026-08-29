import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { restoreFetch, stubApi } from '../test/harness';
import { ShareDialog } from './ShareDialog';

const share = {
  user: { id: 2, email: 'someone@example.com', name: null },
  permission: 'view' as const,
  createdAt: '2026-08-05T00:00:00.000Z',
};

const named = {
  user: { id: 3, email: 'reader@example.com', name: 'Reader' },
  permission: 'edit' as const,
  createdAt: '2026-08-06T00:00:00.000Z',
};

const noShares = { 'GET /api/notes/1/shares': { status: 200, body: { shares: [] } } };

describe('ShareDialog', () => {
  afterEach(restoreFetch);

  it('says so when the note is not shared with anybody', async () => {
    stubApi(noShares);

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);

    expect(await screen.findByText('This note is not shared with anybody yet.')).toBeInTheDocument();
  });

  it('lists who a note is already shared with, and what they may do', async () => {
    stubApi({ 'GET /api/notes/1/shares': { status: 200, body: { shares: [share, named] } } });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);

    // by name where they gave one, by address where they did not
    expect(await screen.findByText('someone@example.com')).toBeInTheDocument();
    expect(screen.getByText('Reader')).toBeInTheDocument();

    // scoped to the list, because the permission menu carries the same wording
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(within(rows[0]).getByText('Can view')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Can edit')).toBeInTheDocument();
  });

  it('shares with the address that was typed and shows the new row', async () => {
    stubApi({
      ...noShares,
      'POST /api/notes/1/shares': { status: 201, body: { share } },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email address'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByText('someone@example.com')).toBeInTheDocument();
  });

  it('keeps a share made while the list was still loading', async () => {
    stubApi({
      // held back so the share below is submitted before this answer arrives
      'GET /api/notes/1/shares': { status: 200, body: { shares: [] }, delayMs: 500 },
      'POST /api/notes/1/shares': { status: 201, body: { share } },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email address'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByText('someone@example.com')).toBeInTheDocument();

    // the older list lands afterwards, and must not take the new row back out
    await expect(
      screen.findByText('This note is not shared with anybody yet.', undefined, { timeout: 2000 }),
    ).rejects.toThrow();
  });

  it('empties the box after a share so the next one starts clean', async () => {
    stubApi({ ...noShares, 'POST /api/notes/1/shares': { status: 201, body: { share } } });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();
    const box = await screen.findByLabelText('Email address');

    await user.type(box, 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('replaces the row rather than listing somebody twice', async () => {
    stubApi({
      'GET /api/notes/1/shares': { status: 200, body: { shares: [share] } },
      'POST /api/notes/1/shares': {
        status: 200,
        body: { share: { ...share, permission: 'edit' } },
      },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email address'), 'someone@example.com');
    await user.selectOptions(screen.getByLabelText('Permission'), 'edit');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    const list = await screen.findByRole('list');

    await waitFor(() => expect(within(list).getByText('Can edit')).toBeInTheDocument());
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).queryByText('Can view')).not.toBeInTheDocument();
  });

  it('says what the API said when there is no such account', async () => {
    stubApi({
      ...noShares,
      'POST /api/notes/1/shares': {
        status: 404,
        body: { error: { message: 'No account with that email' } },
      },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email address'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No account with that email');
  });

  it('puts the API complaint on the field it named', async () => {
    stubApi({
      ...noShares,
      'POST /api/notes/1/shares': {
        status: 400,
        body: {
          error: {
            message: 'Validation failed',
            details: [{ field: 'email', message: 'Enter a valid email address' }],
          },
        },
      },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    // typed past the browser's own check, which would otherwise stop the submit
    await user.type(await screen.findByLabelText('Email address'), 'not-an-address@example.com');
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('takes a share back and drops the row', async () => {
    stubApi({
      'GET /api/notes/1/shares': { status: 200, body: { shares: [share] } },
      'DELETE /api/notes/1/shares/2': { status: 204 },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.queryByText('someone@example.com')).not.toBeInTheDocument(),
    );
  });

  it('keeps the row when the removal failed', async () => {
    stubApi({
      'GET /api/notes/1/shares': { status: 200, body: { shares: [share] } },
      'DELETE /api/notes/1/shares/2': { networkError: true, status: 0 },
    });

    render(<ShareDialog noteId={1} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('someone@example.com')).toBeInTheDocument();
  });

  it('closes on the button and on escape', async () => {
    stubApi(noShares);
    const closed = jest.fn();

    render(<ShareDialog noteId={1} onClose={closed} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
