import { describe, it, expect } from "vitest";
import { buildSecurityHeaders, buildCsp } from "@/lib/security/headers";

const API = "https://api.gira.mx/api/v1";

const byKey = (headers: { key: string; value: string }[]) =>
  Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe("buildCsp", () => {
  it("prohíbe embeber el sitio y plugins, y fija base/form", () => {
    const csp = buildCsp({ apiUrl: API, isProd: true });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("img-src permite solo el host de imágenes de Cloudinary, no un comodín", () => {
    const csp = buildCsp({ apiUrl: "https://api.gira.mx/api/v1", isProd: true });
    expect(csp).toMatch(/img-src 'self' data: blob: https:\/\/res\.cloudinary\.com(;|$)/);
    expect(csp).not.toMatch(/img-src[^;]*(\*|https:(;|\s))/);
    expect(csp).toContain("default-src 'self'");
  });

  it("connect-src permite solo el ORIGEN de la API (sin path)", () => {
    const csp = buildCsp({ apiUrl: API, isProd: true });
    expect(csp).toMatch(/connect-src 'self' https:\/\/api\.gira\.mx(;|$)/);
    expect(csp).not.toContain("/api/v1");
  });

  it("unsafe-eval solo existe en desarrollo", () => {
    expect(buildCsp({ apiUrl: API, isProd: false })).toContain("'unsafe-eval'");
    expect(buildCsp({ apiUrl: API, isProd: true })).not.toContain("'unsafe-eval'");
  });

  it("upgrade-insecure-requests solo en producción", () => {
    expect(buildCsp({ apiUrl: API, isProd: true })).toContain("upgrade-insecure-requests");
    expect(buildCsp({ apiUrl: API, isProd: false })).not.toContain("upgrade-insecure-requests");
  });

  it("una URL de API inválida falla en voz alta", () => {
    expect(() => buildCsp({ apiUrl: "no-es-url", isProd: true })).toThrow();
  });
});

describe("buildSecurityHeaders", () => {
  it("siempre incluye CSP y los headers base", () => {
    const h = byKey(buildSecurityHeaders({ apiUrl: API, isProd: false }));
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it("HSTS solo en producción", () => {
    expect(byKey(buildSecurityHeaders({ apiUrl: API, isProd: true }))["Strict-Transport-Security"]).toContain(
      "max-age=63072000",
    );
    expect(byKey(buildSecurityHeaders({ apiUrl: API, isProd: false }))).not.toHaveProperty(
      "Strict-Transport-Security",
    );
  });
});

describe("buildTokenPageHeaders", () => {
  it("las páginas con token no filtran la URL en Referer ni se guardan en caché", async () => {
    const { buildTokenPageHeaders, TOKEN_PAGE_PATHS } = await import("@/lib/security/headers");
    expect(TOKEN_PAGE_PATHS).toEqual(["/verificar-correo", "/restablecer-contrasena"]);
    expect(buildTokenPageHeaders()).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ]);
  });
});
