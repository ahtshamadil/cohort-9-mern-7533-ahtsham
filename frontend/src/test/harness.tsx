import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

export interface StubbedResponse {
  status: number;
  body?: unknown;
  /** Response headers the caller reads, such as Content-Disposition. */
  headers?: Record<string, string>;
  /** Held back this long before answering, to line up races on purpose. */
  delayMs?: number;
  /** Rejects the way fetch does when it cannot reach the server at all. */
  networkError?: boolean;
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
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const match = routes[key];

    // failing loudly beats a confusing undefined further along - a missing stub
    // is a mistake in the test, not a case worth handling
    if (match === undefined) {
      return Promise.reject(new Error(`No stub for ${key}`));
    }

    // fetch rejects rather than resolving when the server cannot be reached,
    // which is a different path through the callers than any status code
    if (match.networkError === true) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }

    const answer = {
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: () => Promise.resolve(match.body ?? null),
      blob: () =>
        Promise.resolve(
          new Blob([JSON.stringify(match.body ?? null)], { type: 'application/json' }),
        ),
      // jsdom ships no Headers, so get() is the one method worth standing in
      // for. matched without case, because the real one ignores it and a stub
      // written as content-disposition would otherwise read back as absent
      headers: {
        get: (name: string) => {
          const wanted = name.toLowerCase();
          const found = Object.entries(match.headers ?? {}).find(
            ([key]) => key.toLowerCase() === wanted,
          );

          return found?.[1] ?? null;
        },
      },
    } as unknown as Response;

    if (match.delayMs === undefined) {
      return Promise.resolve(answer);
    }

    return new Promise<Response>((resolve) => setTimeout(() => resolve(answer), match.delayMs));
  }) as unknown as typeof fetch;
}

/** Replaces fetch with one that never answers, to hold a request in flight. */
export function stubApiPending(): void {
  globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
}

/** Puts the original fetch back, so one test cannot leak into the next. */
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
