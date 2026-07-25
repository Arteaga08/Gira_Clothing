import type { Request, Response, NextFunction } from "express";

/**
 * Recursively strips MongoDB operator injection and prototype pollution from
 * req.body, req.params and req.query (BACKEND_SECURITY_GUIDELINES §4).
 *
 * Removes any key starting with `$` or containing `.`, plus the dangerous
 * `__proto__` / `constructor` / `prototype` keys. In Express 5 `req.query` is
 * a read-only getter, so it must be mutated in place — never reassigned.
 */

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeInPlace = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) sanitizeInPlace(item);
    return;
  }
  if (!isPlainObject(value)) return;

  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".") || FORBIDDEN_KEYS.has(key)) {
      delete value[key];
      continue;
    }
    sanitizeInPlace(value[key]);
  }
};

const mongoSanitize = (req: Request, _res: Response, next: NextFunction): void => {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.params);
  sanitizeInPlace(req.query); // mutate in place — do not reassign in Express 5
  next();
};

export { mongoSanitize };
