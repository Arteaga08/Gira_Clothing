/**
 * Where a `?redirect=` may send a person after the access pages (login, sign-up, email verification).
 * An allow-list of store areas, never a deny-list: anything else must fall back to the default, so the
 * parameter can never become an open redirect or a login loop. The storefront resolves it with this
 * list; the API only forwards a redirect into an email link when `isSafeRedirectPath` accepts it.
 */
const SAFE_REDIRECT_PREFIXES = ["/tienda", "/cuenta", "/carrito", "/checkout"] as const;

const SAFE_REDIRECT_MAX_LENGTH = 512;

const hasControlChars = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

/**
 * Strict, parse-free check of a same-site path (`/checkout`, `/tienda?categoria=x`). It is deliberately
 * stricter than a URL parser: any dot segment, encoded dot or backslash is refused instead of normalised.
 */
const isSafeRedirectPath = (value: unknown): value is string => {
  if (typeof value !== "string" || value === "" || value.length > SAFE_REDIRECT_MAX_LENGTH) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || hasControlChars(value)) return false;

  const [beforeFragment = ""] = value.split("#");
  const [pathname = ""] = beforeFragment.split("?");
  if (/%2e|%2f|%5c/i.test(pathname)) return false;
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return false;

  return pathname === "/" || SAFE_REDIRECT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

export { SAFE_REDIRECT_PREFIXES, SAFE_REDIRECT_MAX_LENGTH, isSafeRedirectPath };
