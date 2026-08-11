/**
 * An error the API means to return, carrying the status code to send with it.
 *
 * Throwing this is how a route says "the caller got it wrong". Anything else
 * that reaches the error handler is an unexpected fault and still becomes a
 * generic 500, so a bug can never accidentally explain itself to a client.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  /** Per-field information for a client to show, used by validation failures. */
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
