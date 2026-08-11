import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

export interface StubbedResponse {
  status: number;
  body?: unknown;
}

/** A user body matching what the auth routes return. */
export const testUser = {
  id: 1,
  email: 'ahtsham@example.com',
  name: null,
  createdAt: '2026-08-11T00:00:00.000Z',
};

const originalFetch = globalThis.fetch;

/**
 * Answers fetch from a table keyed by "METHOD /path".
 *
 * jsdom ships no fetch at all, so there is nothing to spy on - jest.spyOn
 * throws here. It gets assigned outright instead, and restoreFetch puts the
 * original back.
 */
export function stubApi(routes: Record<string, StubbedResponse>): void {
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const match = routes[key];

    // failing loudly beats a confusing undefined further along - a missing stub
    // is a mistake in the test, not a case worth handling
    if (match === undefined) {
      return Promise.reject(new Error(`No stub for ${key}`));
    }

    return Promise.resolve({
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: () => Promise.resolve(match.body ?? null),
    } as Response);
  }) as unknown as typeof fetch;
}

/** Replaces fetch with one that never answers, to hold a request in flight. */
export function stubApiPending(): void {
  globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

/** Mounts the real routes at a path, inside the router and both contexts. */
export function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
