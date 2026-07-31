/**
 * The four ways a call through `request()` can fail:
 * - "http": the API answered with a 4xx/5xx and a parseable error envelope.
 * - "network": `fetch` itself rejected — no connection, DNS, or the caller's
 *   own AbortSignal was aborted.
 * - "timeout": our own AbortController fired before the server answered.
 * - "parse": the response body wasn't valid JSON, so the envelope couldn't
 *   be read at all.
 */
type ApiErrorKind = "http" | "network" | "timeout" | "parse";

/**
 * The API has no typed error codes (`errorHandler` only ever writes
 * `{status, message}`), so this is where the client puts its own typing.
 * `status` is 0 whenever there was no HTTP response to read a status from.
 */
class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;

  constructor(message: string, kind: ApiErrorKind, status = 0) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

export { ApiError, isApiError };
export type { ApiErrorKind };
