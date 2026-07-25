import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async controller so rejected promises are forwarded to the global
 * error handler — removes repeated try/catch in every controller.
 */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export { asyncHandler };
