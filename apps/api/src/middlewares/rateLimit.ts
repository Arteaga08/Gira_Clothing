import rateLimit, { MemoryStore, ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import { parseBooleanFlag } from "../config/env.js";

/**
 * Rate limiter factory (BACKEND_SECURITY_GUIDELINES §7). Each sensitive action
 * gets its own strict limiter with a dedicated MemoryStore (resettable in
 * tests). Enforcement follows the explicit RATE_LIMIT_ENABLED switch (ON by
 * default; loadEnv refuses to boot a production process with it off). It is
 * read per request from process.env so a test can opt in without re-importing.
 * Admin routes are NOT limited — their barrier is auth + role. The only
 * exception is `/auth/2fa/*`, which is reachable before a session exists.
 *
 * IPv6 clients are bucketed by /56 (`ipKeyGenerator`, via our own keyGenerator
 * because v8 rejects `ipv6Subnet` next to a custom one): a single host owns a
 * whole /64 and could otherwise rotate addresses to dodge every limiter.
 */

const IPV6_SUBNET = 56;

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  /** Overrides the per-IP bucket (e.g. email + IP for login). */
  keyGenerator?: (req: Request) => string;
  /** Count only failed responses (status >= 400). */
  skipSuccessfulRequests?: boolean;
}

const isRateLimitEnabled = (): boolean =>
  parseBooleanFlag(process.env.RATE_LIMIT_ENABLED, true) !== false;

const stores: MemoryStore[] = [];

const ipKey = (req: Request): string => ipKeyGenerator(req.ip ?? "", IPV6_SUBNET);

/** Limiters run before `validate`, so the email is normalised here the same way Joi will. */
const normalizedEmail = (req: Request): string => {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
};

const createLimiter = ({
  windowMs,
  limit,
  message,
  keyGenerator = ipKey,
  skipSuccessfulRequests = false,
}: LimiterOptions): RequestHandler => {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isRateLimitEnabled(),
    message: { status: "fail", message },
  });
};

/** Test helper: empties every limiter's counters. */
const resetRateLimitStores = (): void => {
  // MemoryStore.resetAll is typed as async but clears its maps synchronously.
  for (const store of stores) void store.resetAll();
};

const FIFTEEN_MIN = 15 * 60 * 1000;

// Global backstop for the whole API.
const globalLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 1000,
  message: "Demasiadas solicitudes. Intenta de nuevo en unos minutos.",
});

// Brute force on ONE account: 5 failures per email+IP pair. Keying by the pair
// (not the email alone) means nobody can lock someone else's account from
// another address.
const loginLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKey(req)}|${normalizedEmail(req)}`,
  message: "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
});

// Password spraying: one IP trying many emails never trips the pair limiter.
const loginIpLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 30,
  skipSuccessfulRequests: true,
  message: "Demasiados intentos de inicio de sesión desde esta dirección. Intenta más tarde.",
});

// Second-factor attempts: the per-account lock (5 wrong codes) stops one
// account, this stops one address cycling through many. Only failures count, so
// a legitimate admin finishing the flow never spends it.
const twoFactorLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Demasiados intentos de verificación desde esta dirección. Intenta más tarde.",
});

// Account actions (register, verify, resend, forgot, reset) share ONE per-IP
// bucket: the same instance is mounted on every route, so its counter is common.
const authActionLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  message: "Demasiadas solicitudes desde esta dirección. Intenta de nuevo más tarde.",
});

// Per-mailbox ceilings: the IP alone does not stop someone rotating addresses
// against one inbox. Every request counts — these routes always answer 2xx.
const emailActionLimiter = (message: string): RequestHandler =>
  createLimiter({
    windowMs: FIFTEEN_MIN,
    limit: 3,
    keyGenerator: normalizedEmail,
    message,
  });

const registerEmailLimiter = emailActionLimiter(
  "Demasiados registros con este correo. Intenta de nuevo en 15 minutos.",
);
const resendEmailLimiter = emailActionLimiter(
  "Ya pediste varios enlaces para este correo. Intenta de nuevo en 15 minutos.",
);
const forgotEmailLimiter = emailActionLimiter(
  "Ya pediste varios enlaces para este correo. Intenta de nuevo en 15 minutos.",
);

// Public catalog reads: anti-scraping, not anti-abuse. Generous enough that a
// real storefront session never notices, strict enough that a crawler does.
const catalogLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 500,
  message: "Demasiadas solicitudes al catálogo. Espera unos minutos.",
});

// Cart writes are frequent and low-risk, but not unlimited: a script hammering
// PUT /cart/lines is still write load on the DB.
const cartLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 120,
  message: "Demasiadas operaciones sobre el carrito. Espera un momento.",
});

const wishlistLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 120,
  message: "Demasiadas operaciones sobre tus guardados. Espera un momento.",
});

// Both account limiters count per signed-in user: they run after `protect`, so
// one customer behind a shared IP never eats another's budget.
const userKey = (req: Request): string => (req.user ? String(req.user._id) : ipKey(req));

const accountWriteLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 60,
  keyGenerator: userKey,
  message: "Demasiados cambios en tu cuenta. Espera unos minutos.",
});

// Guessing the current password through a stolen session is the abuse here.
const passwordChangeLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 5,
  keyGenerator: userKey,
  message: "Demasiados intentos de cambio de contraseña. Espera unos minutos.",
});

// Anti card-testing: a scripted checkout loop is how stolen cards get validated.
const checkoutLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 10,
  message: "Demasiados intentos de compra. Espera unos minutos e intenta de nuevo.",
});

// The publicId is unguessable, but a leaked link should not be a scraping tool.
const orderLookupLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 30,
  message: "Demasiadas consultas. Espera unos minutos.",
});

// The tracking link ships in the shipping email and gets opened repeatedly by
// the same customer — looser than orderLookupLimiter, but never absent
// (BACKEND_ARCHITECTURE_GUIDELINES: a public sub-resource always carries its own).
const trackingLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 60,
  message: "Demasiadas consultas de seguimiento. Espera unos minutos.",
});

// Ceiling against unsigned junk at the webhook. Signature verification is the
// real barrier; Stripe's retry bursts stay far below this.
const webhookLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 1000,
  message: "Demasiadas solicitudes.",
});

// Envía's webhook has its own bucket so a burst of tracking events can never
// starve (or be starved by) the payment webhook. Signature verification is the real barrier.
const enviaWebhookLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 1000,
  message: "Demasiadas solicitudes.",
});

// Each quote fans out to one call per carrier at the provider: cheaper than
// checkout, tighter than the catalog.
const shippingQuoteLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 30,
  message: "Demasiadas cotizaciones de envío. Espera unos minutos.",
});

export type { LimiterOptions };
export {
  createLimiter,
  resetRateLimitStores,
  globalLimiter,
  webhookLimiter,
  enviaWebhookLimiter,
  loginIpLimiter,
  loginLimiter,
  twoFactorLimiter,
  authActionLimiter,
  registerEmailLimiter,
  resendEmailLimiter,
  forgotEmailLimiter,
  catalogLimiter,
  cartLimiter,
  wishlistLimiter,
  accountWriteLimiter,
  passwordChangeLimiter,
  checkoutLimiter,
  orderLookupLimiter,
  trackingLimiter,
  shippingQuoteLimiter,
};
