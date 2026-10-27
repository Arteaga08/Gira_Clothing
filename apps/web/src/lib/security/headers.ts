/**
 * Security headers for every response (BACKEND_SECURITY_GUIDELINES §12; the
 * site CSP lives here, not in the API). Pure so it can be unit-tested;
 * next.config.ts only wires it in.
 *
 * Cloudinary is allowed for images ONLY (`img-src`, its delivery host): the
 * panel shows catalog pictures. Stripe (Elements/Checkout) is NOT allowed yet:
 * the storefront that needs it is Block 3, which extends `script-src`,
 * `frame-src` and `connect-src` at that point.
 *
 * `'unsafe-inline'` in script-src is the cost of a static CSP: Next injects
 * inline bootstrap scripts, and a nonce would force every page to render
 * dynamically (and needs middleware). Everything else is locked down.
 */

/** Cloudinary's image delivery host: the only third-party origin the panel may load pictures from. */
const CLOUDINARY_IMAGE_HOST = "https://res.cloudinary.com";

interface SecurityHeadersOptions {
  /** NEXT_PUBLIC_API_URL, e.g. https://api.gira.mx/api/v1 — only its origin is allowed. */
  apiUrl: string;
  isProd: boolean;
}

interface Header {
  key: string;
  value: string;
}

const buildCsp = ({ apiUrl, isProd }: SecurityHeadersOptions): string => {
  // `new URL` throws on garbage: a bad API URL must fail the build, not ship a broken CSP.
  const apiOrigin = new URL(apiUrl).origin;

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${CLOUDINARY_IMAGE_HOST}`,
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
};

const buildSecurityHeaders = (options: SecurityHeadersOptions): Header[] => [
  { key: "Content-Security-Policy", value: buildCsp(options) },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(options.isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

/**
 * Pages whose URL carries a one-use token (emailed links). They must not leak it
 * through `Referer` (not even to our own API, which `strict-origin-when-cross-origin`
 * would still allow the path of) and must never be cached.
 */
const TOKEN_PAGE_PATHS = ["/verificar-correo", "/restablecer-contrasena"] as const;

const buildTokenPageHeaders = (): Header[] => [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

export type { SecurityHeadersOptions, Header };
export { buildCsp, buildSecurityHeaders, buildTokenPageHeaders, TOKEN_PAGE_PATHS };
