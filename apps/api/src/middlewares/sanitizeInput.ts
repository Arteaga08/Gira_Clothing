import type { Request, Response, NextFunction } from "express";
import { filterXSS } from "xss";

/**
 * Recursive XSS sanitization of incoming strings (BACKEND_SECURITY_GUIDELINES §5).
 * Credential fields are intentionally left untouched: escaping them would alter
 * the secret the user actually typed.
 *
 * The exemption is kept as NARROW as possible, because it applies to a key of
 * that name at ANY depth. `code` used to be here for the 6-digit TOTP — but a
 * TOTP has nothing filterXSS would touch, so the exemption bought nothing and
 * would silently have covered a future "código de cupón" or any other field
 * someone happens to name `code`. Only values that can legitimately contain
 * markup characters belong in this set.
 */

const CREDENTIAL_KEYS = new Set(["password", "token", "secret"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeValue = (value: unknown, key?: string): unknown => {
  if (typeof value === "string") {
    if (key && CREDENTIAL_KEYS.has(key)) return value;
    return filterXSS(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      value[k] = sanitizeValue(value[k], k);
    }
    return value;
  }
  return value;
};

const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body !== undefined) req.body = sanitizeValue(req.body);
  if (req.params !== undefined) sanitizeValue(req.params); // object mutated in place
  if (req.query !== undefined) sanitizeValue(req.query); // read-only getter in Express 5
  next();
};

export { sanitizeInput };
