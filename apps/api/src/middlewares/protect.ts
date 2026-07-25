import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { UserRole } from "@gira/shared";
import { verifyAuthToken } from "../utils/token.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";

/**
 * `protect` verifies the session JWT from the HttpOnly cookie and loads the
 * active user onto req.user. `restrictTo` runs AFTER protect and checks the
 * role (BACKEND_SECURITY_GUIDELINES §3).
 */

const protect: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[env.cookieName];
    if (!token) {
      throw new AppError("No has iniciado sesión.", 401);
    }

    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new AppError("Tu sesión ya no es válida. Inicia sesión de nuevo.", 401);
    }

    req.user = user;
    next();
  },
);

const restrictTo =
  (...roles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("No tienes permiso para realizar esta acción.", 403));
      return;
    }
    next();
  };

export { protect, restrictTo };
