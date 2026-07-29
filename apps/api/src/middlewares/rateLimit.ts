import rateLimit, { MemoryStore } from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * Rate limiter factory (BACKEND_SECURITY_GUIDELINES §7). Each sensitive action
 * gets its own strict limiter with a dedicated MemoryStore (resettable in
 * tests). Enforcement is skipped outside production — decided per request via
 * process.env — so development and tests are never throttled, yet a test can
 * opt in by setting NODE_ENV=production temporarily.
 * Admin routes are NOT limited — their barrier is auth + role.
 */

interface LimiterOptions {
  windowMs: number;
  max: number;
  message: string;
}

const createLimiter = ({ windowMs, max, message }: LimiterOptions): RequestHandler =>
  rateLimit({
    windowMs,
    max,
    store: new MemoryStore(),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== "production",
    message: { status: "fail", message },
  });

const FIFTEEN_MIN = 15 * 60 * 1000;

// Global backstop for the whole API.
const globalLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 1000,
  message: "Demasiadas solicitudes. Intenta de nuevo en unos minutos.",
});

const loginLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 5,
  message: "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
});

const registerLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 10,
  message: "Demasiados registros desde esta dirección. Intenta de nuevo más tarde.",
});

// Public catalog reads: anti-scraping, not anti-abuse. Generous enough that a
// real storefront session never notices, strict enough that a crawler does.
const catalogLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 500,
  message: "Demasiadas solicitudes al catálogo. Espera unos minutos.",
});

// Cart writes are frequent and low-risk, but not unlimited: a script hammering
// PUT /cart/lines is still write load on the DB.
const cartLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 120,
  message: "Demasiadas operaciones sobre el carrito. Espera un momento.",
});

// Anti card-testing: a scripted checkout loop is how stolen cards get validated.
const checkoutLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 10,
  message: "Demasiados intentos de compra. Espera unos minutos e intenta de nuevo.",
});

// The publicId is unguessable, but a leaked link should not be a scraping tool.
const orderLookupLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 30,
  message: "Demasiadas consultas. Espera unos minutos.",
});

// The tracking link ships in the shipping email and gets opened repeatedly by
// the same customer — looser than orderLookupLimiter, but never absent
// (BACKEND_ARCHITECTURE_GUIDELINES: a public sub-resource always carries its own).
const trackingLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 60,
  message: "Demasiadas consultas de seguimiento. Espera unos minutos.",
});

export type { LimiterOptions };
export {
  createLimiter,
  globalLimiter,
  loginLimiter,
  registerLimiter,
  catalogLimiter,
  cartLimiter,
  checkoutLimiter,
  orderLookupLimiter,
  trackingLimiter,
};
