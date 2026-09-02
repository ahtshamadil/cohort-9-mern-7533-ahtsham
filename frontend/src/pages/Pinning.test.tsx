import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi, testUser } from '../test/harness';
import { server } from '../test/realtime';

const signedIn = { 'GET /api/auth/me': { status: 200, body: { user: testUser } } };

const owner = { id: 1, email: 'ahtsham@example.com', name: null };

const shopping = {
  id: 1,
  title: 'Shopping',
  content: '<p>Milk and bread</p>',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  pinned: false,
  owner,
  permission: 'owner' as const,
};

const ideas = {
  id: 2,
  title: 'Ideas',
  content: '<p>A better mousetrap</p>',
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
  pinned: false,
  owner,
  permission: 'owner' as const,
};

const listed = { status: 200, body: { notes: [shopping, ideas], total: 2 } };

/** The note titles in the order the list is drawing them. */
function titles(): string[] {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '');
}

describe('pinning a note', () => {
  afterEach(() => {
    restoreFetch();
    server.reset();
    jest.restoreAllMocks();
  });

  it('offers a pin on each note you own', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': listed });

    renderApp('/');

    expect(await screen.findByRole('button', { name: 'Pin Shopping' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pin Ideas' })).toBeInTheDocument();
  });

  it('says a pinned note is pressed, and offers to unpin it', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': {
        status: 200,
        body: { notes: [{ ...shopping, pinned: true }, ideas], total: 2 },
      },
    });

    renderApp('/');

    const pin = await screen.findByRole('button', { name: 'Unpin Shopping' });

    expect(pin).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends the pin to the API', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': listed,
      'PATCH /api/notes/2': { status: 200, body: { note: { ...ideas, pinned: true } } },
    });

    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Pin Ideas' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/notes/2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ pinned: true }) }),
      );
    });
  });

  it('moves the pinned note to the top without waiting for the answer', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': listed,
      'PATCH /api/notes/2': {
        status: 200,
        body: { note: { ...ideas, pinned: true } },
        delayMs: 50,
      },
    });

    renderApp('/');

    expect(await screen.findByText('Shopping')).toBeInTheDocument();
    expect(titles()).toEqual(['Shopping', 'Ideas']);

    await userEvent.click(screen.getByRole('button', { name: 'Pin Ideas' }));

    await waitFor(() => {
      expect(titles()).toEqual(['Ideas', 'Shopping']);
    });
  });

  it('takes a pin off again', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': {
        status: 200,
        body: { notes: [{ ...shopping, pinned: true }, ideas], total: 2 },
      },
      'PATCH /api/notes/1': { status: 200, body: { note: shopping } },
    });

    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Unpin Shopping' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/notes/1',
        expect.objectContaining({ body: JSON.stringify({ pinned: false }) }),
      );
    });

    expect(await screen.findByRole('button', { name: 'Pin Shopping' })).toBeInTheDocument();
  });

  it('puts the card back and says so when the pin will not save', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': listed,
      'PATCH /api/notes/2': { status: 500, body: { error: { message: 'Something went wrong' } } },
    });

    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Pin Ideas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change that pin');

    // back where it started, rather than left looking pinned
    await waitFor(() => {
      expect(titles()).toEqual(['Shopping', 'Ideas']);
    });
    expect(screen.getByRole('button', { name: 'Pin Ideas' })).toBeInTheDocument();
  });

  it('does not offer a pin on somebody elses note', async () => {
    const shared = {
      ...shopping,
      owner: { id: 2, email: 'someone@example.com', name: 'Someone' },
      permission: 'edit' as const,
    };

    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': { status: 200, body: { notes: [], total: 0 } },
      'GET /api/notes/shared?page=1&limit=20': {
        status: 200,
        body: { notes: [shared], total: 1 },
      },
    });

    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'Shared with you' }));

    expect(await screen.findByText('Shopping')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pin/i })).not.toBeInTheDocument();
  });

  it('draws a pinned note first even when the API listed it second', async () => {
    stubApi({
      ...signedIn,
      'GET /api/notes?page=1&limit=20': {
        status: 200,
        body: { notes: [shopping, { ...ideas, pinned: true }], total: 2 },
      },
    });

    renderApp('/');

    expect(await screen.findByText('Ideas')).toBeInTheDocument();
    expect(titles()).toEqual(['Ideas', 'Shopping']);
  });

  it('keeps the pin out of the card link', async () => {
    stubApi({ ...signedIn, 'GET /api/notes?page=1&limit=20': listed });

    renderApp('/');

    const link = await screen.findByRole('link', { name: /Shopping/ });

    // a button inside an anchor is not valid, and clicking it would navigate
    expect(within(link).queryByRole('button')).not.toBeInTheDocument();
  });
});
