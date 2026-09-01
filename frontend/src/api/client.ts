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

/** Reads whatever the API said about a failure and wraps it in an ApiError. */
async function failure(response: Response): Promise<ApiError> {
  // a proxy failure or a crash can answer with html, so a body that will not
  // parse is treated as no body rather than being allowed to throw here
  const body: unknown = await response.json().catch(() => null);
  const envelope = (body ?? {}) as ErrorEnvelope;

  return new ApiError(
    response.status,
    envelope.error?.message ?? `Request failed with status ${response.status}`,
    envelope.error?.details ?? [],
  );
}

/**
 * Calls the API and hands back the response itself, throwing an ApiError if it
 * failed. The export download wants the bytes rather than a parsed body.
 *
 * An ApiError means the server answered and refused. A server that could not be
 * reached at all is fetch's own TypeError, deliberately left to propagate as
 * itself - callers tell the two apart, and the screens say something different
 * for a request that never arrived than for one that came back rejected.
 *
 * No credentials option is set. Vite proxies /api to the backend, so these are
 * same-origin requests and fetch already sends the session cookie with them.
 */
export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (!response.ok) {
    throw await failure(response);
  }

  return response;
}

/** Calls the API and returns the parsed body. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, options);

  // logout answers 204, which has no body to parse
  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => null);

  return body as T;
}

/**
 * The longest password the API stores, in characters.
 *
 * The API counts bytes, because that is what bcrypt reads. A character can be
 * up to four of them, so this only stops the obvious case - anything past it is
 * still refused by the API and shown as a field error.
 */
export const maxPasswordLength = 72;

/** Changes the signed-in account's password. Ends every other session. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
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
