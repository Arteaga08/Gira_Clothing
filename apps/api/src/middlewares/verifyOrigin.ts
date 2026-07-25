import type { Request, Response, NextFunction } from "express";
import { allowedOrigins } from "../config/cors.js";
import { AppError } from "../utils/AppError.js";

/**
 * CSRF defense-in-depth (BACKEND_SECURITY_GUIDELINES §6). On mutating methods,
 * rejects requests whose Origin (or Referer fallback) is not whitelisted.
 * Requests with neither header (server-to-server, CLI, health checks) are
 * allowed — they are not browser CSRF, and auth still applies.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const originOf = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const verifyOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
  if (origin === null) {
    next(); // no browser origin context — not a CSRF vector
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    next(new AppError("Origen no permitido.", 403));
    return;
  }

  next();
};

export { verifyOrigin };
