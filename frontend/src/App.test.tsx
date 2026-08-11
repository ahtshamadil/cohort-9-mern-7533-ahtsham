import { render, screen } from '@testing-library/react';

import App from './App';
import { restoreFetch, stubApi } from './test/harness';

describe('App', () => {
  afterEach(restoreFetch);

  it('shows the log-in screen to somebody who is not signed in', async () => {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
    });

    // App brings its own BrowserRouter, so this mounts the whole thing the way
    // main.tsx does rather than the routes on their own
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
