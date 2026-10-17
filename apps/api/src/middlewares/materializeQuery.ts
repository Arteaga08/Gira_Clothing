import type { Request, Response, NextFunction } from "express";

/**
 * Express 5 defines `req.query` as a getter on the prototype that re-parses
 * the URL on EVERY access. Anything that mutates the object it returns
 * (mongoSanitize, sanitizeInput, validate) mutates a throwaway copy, and the
 * controller then reads a fresh, untouched one.
 *
 * Reading it once and pinning it as an own property makes the parsed object
 * stable for the rest of the request, so those middlewares act on the very
 * object the controller receives. Must run before any of them.
 */
const materializeQuery = (req: Request, _res: Response, next: NextFunction): void => {
  Object.defineProperty(req, "query", {
    value: req.query,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  next();
};

export { materializeQuery };
