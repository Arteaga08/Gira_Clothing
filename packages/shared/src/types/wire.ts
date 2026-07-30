/**
 * Maps a server-side DTO (which may contain real `Date` objects) to the shape
 * a JSON HTTP response actually carries. `JSON.stringify` turns every `Date`
 * into an ISO string — a client that types the parsed response as `Date` is
 * one `order.createdAt.toLocaleDateString()` away from a runtime exception.
 *
 * Apply this ONLY at the HTTP boundary (apps/web's api client). The API
 * itself keeps using the plain interfaces below, where `Date` is real.
 */
type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export type { Wire };
