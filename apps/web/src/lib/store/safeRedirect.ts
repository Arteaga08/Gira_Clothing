import { STORE_ROUTES } from "./routes";

/**
 * Where `?redirect=` may send a visitor after login. An allow-list of store
 * areas, not a deny-list: anything else (another origin, the admin panel, the
 * access pages themselves) falls back to `fallback`, so the parameter can
 * never become an open redirect or a login loop.
 */
const ALLOWED_PREFIXES = [STORE_ROUTES.shop, STORE_ROUTES.account, STORE_ROUTES.cart, "/checkout"] as const;
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
