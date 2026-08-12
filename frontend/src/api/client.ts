/** A problem with one field, in the shape the API reports on a 400. */
export interface FieldError {
  field: string;
  message: string;
}

/** The envelope the backend wraps every failure in. */
interface ErrorEnvelope {
  error?: {
    message?: string;
    details?: FieldError[];
  };
}

/** A failed request, carrying what the API said rather than just a status. */
export class ApiError extends Error {
  readonly status: number;

  /** Empty unless the API rejected specific fields, which it does on a 400. */
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Calls the API and returns the parsed body, throwing an ApiError if the
 * response was not a success.
 *
 * No credentials option is set. Vite proxies /api to the backend, so these are
 * same-origin requests and fetch already sends the session cookie with them.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  // logout answers 204, which has no body to parse
  if (response.status === 204) {
    return undefined as T;
  }

  // a proxy failure or a crash can answer with html, so a body that will not
  // parse is treated as no body rather than being allowed to throw here
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body ?? {}) as ErrorEnvelope;

    throw new ApiError(
      response.status,
      envelope.error?.message ?? `Request failed with status ${response.status}`,
      envelope.error?.details ?? [],
    );
  }

  return body as T;
}

/** Turns the API's list of field errors into a lookup the forms can index by name. */
export function byField(fieldErrors: FieldError[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const { field, message } of fieldErrors) {
    // first message wins - showing one problem per input is enough to act on
    result[field] ??= message;
  }

  return result;
}
