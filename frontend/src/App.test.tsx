import { render, screen } from '@testing-library/react';

import App from './App';

describe('App', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the status reported by the health endpoint', async () => {
    // jsdom has no fetch of its own, so there is nothing to spy on - it gets
    // replaced outright. the stub returns the same shape the backend's
    // /api/health route does, and is put back in afterEach.
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', uptime: 12.5 }),
    }) as unknown as typeof fetch;

    render(<App />);

    expect(await screen.findByText('ok')).toBeInTheDocument();
  });
});
