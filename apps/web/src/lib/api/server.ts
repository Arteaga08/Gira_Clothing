import { cookies } from "next/headers";
import type { ApiResult, RequestOptions } from "./request";
import { request } from "./request";

/**
 * Must match `COOKIE_NAME` in apps/api/src/config/env.ts. Kept as a constant
 * rather than an env var: a value that has to agree between two apps is the
 * same coupling either way, but an env var mismatch fails silently (the
 * panel just behaves as if no one is logged in), while this is at least
 * grep-able from one file.
 */
const SESSION_COOKIE_NAME = "gira_session";

/**
 * GET-only by type. Spec §6: mutations never leave a Server Component, so
 * `method` and `body` aren't options here at all — passing them is a
 * compile error, not a runtime one to catch in review.
 */
type ServerRequestOptions = Omit<RequestOptions, "method" | "body" | "credentials" | "cache">;

/**
 * The server-side entry point. Next does not forward the session cookie on
 * its own for a server-side `fetch` — it has to be read with `cookies()` and
 * attached by hand — and every call is `cache: "no-store"`: a stale "am I
 * logged in" answer is a security bug, not a performance win.
 */
const serverRequest = async <T>(path: string, options: ServerRequestOptions = {}): Promise<ApiResult<T>> => {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME);

  const headers: Record<string, string> = { ...options.headers };
  if (sessionCookie) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${sessionCookie.value}`;
  }

  return request<T>(path, { ...options, headers, cache: "no-store" });
};

export { serverRequest, SESSION_COOKIE_NAME };
export type { ServerRequestOptions };
