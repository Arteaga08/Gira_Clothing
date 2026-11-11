import { SAFE_REDIRECT_PREFIXES } from "@gira/shared";
import { STORE_ROUTES } from "./routes";

/**
 * Where `?redirect=` may send a visitor after login. An allow-list of store
 * areas, not a deny-list: anything else (another origin, the admin panel, the
 * access pages themselves) falls back to `fallback`, so the parameter can
 * never become an open redirect or a login loop.
 */
// The same list the API uses before it puts a redirect into an email link (`@gira/shared`).
const ALLOWED_PREFIXES = SAFE_REDIRECT_PREFIXES;
const MAX_LENGTH = 512;
// A throwaway origin: a value that resolves anywhere else was never a same-site path.
const PROBE_ORIGIN = "http://redirect.invalid";

const hasControlChars = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

const isAllowedPath = (pathname: string): boolean =>
  pathname === STORE_ROUTES.home ||
  ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const resolveRedirect = (raw: string | string[] | undefined, fallback: string = STORE_ROUTES.account): string => {
  // A repeated parameter arrives as an array: ambiguous, so not trusted.
  if (typeof raw !== "string" || raw === "" || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || hasControlChars(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN || !isAllowedPath(url.pathname)) return fallback;

  return `${url.pathname}${url.search}`;
};

export { resolveRedirect };
