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

export type { LimiterOptions };
export { createLimiter, globalLimiter, loginLimiter, registerLimiter };
