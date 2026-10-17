import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ObjectSchema } from "joi";
import { AppError } from "../utils/AppError.js";

type ValidationSource = "body" | "params" | "query";

/**
 * Joi validation middleware (BACKEND_SECURITY_GUIDELINES §8). Strips unknown
 * keys (kills mass assignment) and collects every message into a single 400.
 * The cleaned value replaces the source. In Express 5 `req.query` is a getter
 * that re-parses the URL on each read, so this only sticks because
 * `materializeQuery` pins it as an own property earlier in the chain.
 *
 * `req.body` is `undefined` (not `{}`) when `express.json()` skips parsing —
 * an unexpected Content-Type, or no body at all. Joi accepts `undefined`
 * silently on a schema with no required fields, which would let the request
 * through with `value` unset and crash downstream as an unhandled 500 instead
 * of the 400 this middleware exists to produce. Feeding `{}` in that case
 * lets the schema's own `.required()` rules do their job normally.
 */
const validate =
  (schema: ObjectSchema, source: ValidationSource = "body"): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const validationTarget: unknown = source === "body" ? (req.body ?? {}) : req[source];
    const { value, error } = schema.validate(validationTarget, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    }) as { value: Record<string, unknown>; error?: { details: { message: string }[] } };

    if (error) {
      const message = error.details.map((d) => d.message).join(". ");
      next(new AppError(message, 400));
      return;
    }

    req[source] = value;

    next();
  };

export type { ValidationSource };
export { validate };
