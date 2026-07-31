import { afterEach, vi } from "vitest";

/**
 * Test doubles for `fetch`. Deliberately not `new Response(...)`: its
 * availability and behaviour depend on the jsdom/Node version running the
 * suite. A plain object cast to `Response` gives full control over exactly
 * the surface `src/lib/api/request.ts` touches (`ok`, `status`, `json()`).
 */
const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

/** A response whose body is not valid JSON — exercises the `kind: "parse"` path. */
const brokenJsonResponse = (status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
  }) as Response;

/**
 * Installs a `vi.fn()` in place of `globalThis.fetch` and restores the
 * original after each test. Returns the mock so callers can set
 * `mockResolvedValueOnce` / `mockRejectedValueOnce` per case.
 */
const stubFetch = (): ReturnType<typeof vi.fn> => {
  const original = globalThis.fetch;
  const mock = vi.fn();
  globalThis.fetch = mock as unknown as typeof fetch;

  afterEach(() => {
    globalThis.fetch = original;
  });

  return mock;
};

/** What `fetch` itself throws when there is no network — `kind: "network"`. */
const networkFailure = (): Promise<never> => Promise.reject(new TypeError("Failed to fetch"));

export { jsonResponse, brokenJsonResponse, stubFetch, networkFailure };
