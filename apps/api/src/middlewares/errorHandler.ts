import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Global error handler (BACKEND_SECURITY_GUIDELINES §11). Normalizes known
 * errors into operational AppErrors. In production only { status, message } is
 * returned — never a stack trace or internal detail; unexpected errors collapse
 * to a generic "Algo salió mal". Development includes the stack for debugging.
 */

interface MongoLikeError {
  name?: string;
  code?: number;
  type?: string;
  message?: string;
  errors?: Record<string, { message: string }>;
  keyValue?: Record<string, unknown>;
}

const normalize = (err: unknown): AppError => {
  if (err instanceof AppError) return err;

  const e = err as MongoLikeError;

  // body-parser (express.json) errors.
  if (e.type === "entity.too.large") {
    return new AppError("La solicitud excede el tamaño máximo permitido.", 413);
  }
  if (e.type === "entity.parse.failed") {
    return new AppError("El cuerpo de la solicitud no es un JSON válido.", 400);
  }

  switch (e.name) {
    case "CastError":
      return new AppError("Identificador con formato inválido.", 400);
    case "ValidationError": {
      const detail = e.errors
        ? Object.values(e.errors)
            .map((v) => v.message)
            .join(". ")
        : "Datos inválidos.";
      return new AppError(detail, 400);
    }
    case "JsonWebTokenError":
      return new AppError("Sesión inválida. Inicia sesión de nuevo.", 401);
    case "TokenExpiredError":
      return new AppError("Tu sesión expiró. Inicia sesión de nuevo.", 401);
    default:
      break;
  }

  if (e.code === 11000) {
    const field = e.keyValue ? Object.keys(e.keyValue)[0] : undefined;
    return new AppError(
      field ? `Ya existe un registro con ese ${field}.` : "Registro duplicado.",
      409,
    );
  }

  // Unknown / non-operational error.
  return new AppError("Algo salió mal.", 500);
};

// Express needs 4 args to treat this as an error handler (hence _req/_next).
const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const appError = normalize(err);

  if (!appError.isOperational || appError.statusCode >= 500) {
    logger.error({ err, statusCode: appError.statusCode }, "Unhandled error");
  }

  const body: Record<string, unknown> = {
    status: appError.statusCode >= 500 ? "error" : "fail",
    message: appError.message,
  };

  if (env.nodeEnv === "development" && err instanceof Error) {
    body.stack = err.stack;
  }

  res.status(appError.statusCode).json(body);
};

export { errorHandler };
