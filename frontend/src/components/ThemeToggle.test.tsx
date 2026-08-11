import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi } from '../test/harness';

describe('ThemeToggle', () => {
  afterEach(() => {
    restoreFetch();
    // the toggle writes to the document and to storage, and neither is undone
    // by unmounting, so one test would otherwise start where the last finished
    document.documentElement.dataset.theme = 'light';
    localStorage.clear();
  });

  /** Renders the log-in screen, which carries the toggle. */
  function renderLogin() {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
    });

    return renderApp('/login');
  }

  it('switches the document to dark and back', async () => {
    document.documentElement.dataset.theme = 'light';
    renderLogin();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('takes the no-transitions flag back off after the swap', async () => {
    document.documentElement.dataset.theme = 'light';
    renderLogin();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Switch to dark theme' }));

    // the flag suppresses every transition on the page. left on, nothing in the
    // app would animate again for the rest of the session, and nothing would
    // look broken enough to notice
    await waitFor(() => {
      expect(document.documentElement.dataset.switching).toBeUndefined();
    });
  });

  it('remembers the choice for the next visit', async () => {
    document.documentElement.dataset.theme = 'light';
    renderLogin();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Switch to dark theme' }));

    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('starts from the theme the document already has', async () => {
    // the inline script in index.html sets this before react runs, so the
    // provider reads it rather than deciding again and disagreeing
    document.documentElement.dataset.theme = 'dark';
    renderLogin();

    expect(await screen.findByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });
});
