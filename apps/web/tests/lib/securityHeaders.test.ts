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
