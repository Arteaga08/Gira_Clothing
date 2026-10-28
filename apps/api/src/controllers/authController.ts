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
  logoutAllSessions,
  loginUser,
  getCurrentUser,
  type RegisterInput,
  type LoginInput,
} from "../services/authService.js";
import { verifyEmail as verifyEmailService, resendVerification } from "../services/emailVerificationService.js";
import { requestPasswordReset, resetPassword as resetPasswordService } from "../services/passwordResetService.js";
import { changePassword as changePasswordService } from "../services/passwordChangeService.js";
import { recordAudit } from "../services/auditService.js";

/**
 * Auth controllers — orchestrate req/res only. They never touch models and
 * never build JSON by hand (always via sendResponse).
 */

const register = asyncHandler(async (req: Request, res: Response) => {
  // Identical answer whether or not the email already had an account. No session:
  // the account opens only after the activation link.
  await registerCustomer(req.body as RegisterInput);
  sendResponse(res, 201, "Revisa tu correo para activar tu cuenta. El enlace vence en 24 horas.");
});

const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  await verifyEmailService(token, password, { ip: req.ip });
  sendResponse(res, 200, "Tu cuenta está activa. Ya puedes iniciar sesión.");
});

const resendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  await resendVerification((req.body as { email: string }).email);
  sendResponse(res, 200, "Si tu cuenta está pendiente de activar, te enviamos un enlace nuevo.");
});

const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await requestPasswordReset((req.body as { email: string }).email, { ip: req.ip });
  sendResponse(
    res,
    200,
    "Si el correo tiene una cuenta, te enviamos un enlace para restablecer tu contraseña. Vence en 1 hora.",
  );
});

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  await resetPasswordService(token, password, { ip: req.ip });
  sendResponse(res, 200, "Tu contraseña cambió. Inicia sesión con la nueva.");
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

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.sessionId) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await changePasswordService(req.user._id, req.sessionId, currentPassword, newPassword, { ip: req.ip });
  sendResponse(res, 200, "Cambiamos tu contraseña y cerramos tus otras sesiones.");
});

const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  const user = await getCurrentUser(req.user.id as string);
  sendResponse(res, 200, "Usuario autenticado.", { user });
});

const logout = asyncHandler(async (req: Request, res: Response) => {
  // Delete the session first: clearing the cookie only helps this browser, a
  // copied token would stay valid until it expires. Other devices stay signed in.
  if (req.sessionId) await logoutUser(req.sessionId);
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

const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  await logoutAllSessions(req.user.id as string);
  res.cookie(env.cookieName, "", buildClearCookieOptions());
  await recordAudit({
    actorId: req.user._id,
    actorType: "user",
    action: AuditAction.LOGOUT_ALL,
    module: AuditModule.AUTH,
    ip: req.ip,
  });
  sendResponse(res, 200, "Cerramos tu sesión en todos tus dispositivos.");
});

export {
  changePassword,
  register,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  login,
  me,
  logout,
  logoutAll,
};
