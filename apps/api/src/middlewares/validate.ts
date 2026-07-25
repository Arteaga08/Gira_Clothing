import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ObjectSchema } from "joi";
import { AppError } from "../utils/AppError.js";

type ValidationSource = "body" | "params" | "query";

/**
 * Joi validation middleware (BACKEND_SECURITY_GUIDELINES §8). Strips unknown
 * keys (kills mass assignment) and collects every message into a single 400.
 * For body/params the cleaned value replaces the source; query is a read-only
 * getter in Express 5, so its keys are mutated in place instead.
 */
const validate =
  (schema: ObjectSchema, source: ValidationSource = "body"): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    }) as { value: Record<string, unknown>; error?: { details: { message: string }[] } };

    if (error) {
      const message = error.details.map((d) => d.message).join(". ");
      next(new AppError(message, 400));
      return;
    }

    if (source === "query") {
      const target = req.query as Record<string, unknown>;
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, value);
    } else {
      req[source] = value;
    }

    next();
  };

export type { ValidationSource };
export { validate };
