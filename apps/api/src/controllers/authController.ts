import type { Request, Response } from "express";
import { AuditAction, AuditModule } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildCookieOptions, buildClearCookieOptions } from "../utils/token.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import {
  challengeCookieName,
  signChallengeToken,
  buildChallengeCookieOptions,
} from "../utils/twoFactorChallenge.js";
import {
  registerCustomer,
  logoutUser,
  loginUser,
  getCurrentUser,
  type RegisterInput,
  type LoginInput,
} from "../services/authService.js";
import { recordAudit } from "../services/auditService.js";

/**
 * Auth controllers — orchestrate req/res only. They never touch models and
 * never build JSON by hand (always via sendResponse).
 */

const register = asyncHandler(async (req: Request, res: Response) => {
  // Identical answer whether or not the email already had an account.
  await registerCustomer(req.body as RegisterInput);
  sendResponse(res, 201, "Registro recibido. Si el correo no tenía cuenta, ya puedes iniciar sesión.");
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body as LoginInput, { ip: req.ip });

  if (result.kind === "session") {
    res.cookie(env.cookieName, result.token, buildCookieOptions());
    sendResponse(res, 200, "Sesión iniciada correctamente.", {
      status: "authenticated",
      user: result.user,
    });
    return;
  }

  // Admin: password accepted, but no session yet. The challenge cookie only
  // opens the 2FA routes; the code arrives in a separate request.
  const challenge = signChallengeToken({
    sub: result.userId,
    purpose: result.purpose,
    tv: result.tv,
  });
  res.cookie(challengeCookieName(), challenge, buildChallengeCookieOptions());
  sendResponse(res, 200, "Contraseña correcta. Falta la verificación en dos pasos.", {
    status: result.purpose === "verify" ? "two_factor_required" : "enrollment_required",
  });
});

const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  const user = await getCurrentUser(req.user.id as string);
  sendResponse(res, 200, "Usuario autenticado.", { user });
});

const logout = asyncHandler(async (req: Request, res: Response) => {
  // Bump tokenVersion first: clearing the cookie only helps this browser, a
  // copied token would stay valid until it expires.
  if (req.user) await logoutUser(req.user.id as string);
  res.cookie(env.cookieName, "", buildClearCookieOptions());
  await recordAudit({
    actorId: req.user?._id,
    actorType: "user",
    action: AuditAction.LOGOUT,
    module: AuditModule.AUTH,
    ip: req.ip,
  });
  sendResponse(res, 200, "Sesión cerrada correctamente.");
});

export { register, login, me, logout };
