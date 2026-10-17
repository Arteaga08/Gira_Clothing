import type { Request, Response, NextFunction } from "express";

/**
 * Recursively strips MongoDB operator injection and prototype pollution from
 * req.body, req.params and req.query (BACKEND_SECURITY_GUIDELINES §4).
 *
 * Removes any key starting with `$` or containing `.`, plus the dangerous
 * `__proto__` / `constructor` / `prototype` keys. `req.query` is only stable
 * because `materializeQuery` pins it first (Express 5 re-parses it per read).
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
  sanitizeInPlace(req.query); // stable object thanks to materializeQuery
  next();
};

export { mongoSanitize };
