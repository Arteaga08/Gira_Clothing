import type { Request, Response } from "express";
import { AuditAction, AuditModule } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildCookieOptions, buildClearCookieOptions } from "../utils/token.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import {
  registerCustomer,
  logoutUser,
  loginUser,
  getCurrentUser,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
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
  const { user, token } = await loginUser(req.body as LoginInput, { ip: req.ip });
  res.cookie(env.cookieName, token, buildCookieOptions());
  sendResponse(res, 200, "Sesión iniciada correctamente.", { user });
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

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  return req.user.id as string;
};

const twoFactorSetup = asyncHandler(async (req: Request, res: Response) => {
  // Only used when the account already has 2FA active — see setupTwoFactor.
  // A request with no body at all leaves req.body undefined in Express 5, and
  // that is the normal case here: the first-time setup sends nothing.
  const { code } = (req.body ?? {}) as { code?: string };
  const { otpauthUrl, secret } = await setupTwoFactor(requireUser(req), { ip: req.ip }, code);
  sendResponse(res, 200, "Escanea el código con tu app de autenticación.", {
    otpauthUrl,
    secret,
  });
});

const twoFactorEnable = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body as { code: string };
  await enableTwoFactor(requireUser(req), code, { ip: req.ip });
  sendResponse(res, 200, "Verificación en dos pasos activada.");
});

const twoFactorDisable = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body as { code: string };
  await disableTwoFactor(requireUser(req), code, { ip: req.ip });
  sendResponse(res, 200, "Verificación en dos pasos desactivada.");
});

export { register, login, me, logout, twoFactorSetup, twoFactorEnable, twoFactorDisable };
