import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildCookieOptions, buildClearCookieOptions } from "../utils/token.js";
import {
  challengeCookieName,
  buildClearChallengeCookieOptions,
} from "../utils/twoFactorChallenge.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { issueSession } from "../services/authService.js";
import {
  verifyCode,
  startEnrollment,
  completeEnrollment,
  resetTwoFactor,
} from "../services/twoFactorService.js";

/**
 * Second-factor controllers — req/res orchestration only. `requireChallenge`
 * (login steps) or `protect` (setup) has already put the user on req.user.
 */

const requireUser = (req: Request) => {
  if (!req.user) {
    throw new AppError("No has iniciado sesión.", 401);
  }
  return req.user;
};

const verify = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { code } = req.body as { code: string };
  await verifyCode(user.id as string, code, { ip: req.ip });

  const session = await issueSession(user, { ip: req.ip });
  res.cookie(challengeCookieName(), "", buildClearChallengeCookieOptions());
  res.cookie(env.cookieName, session.token, buildCookieOptions());
  sendResponse(res, 200, "Sesión iniciada correctamente.", {
    status: "authenticated",
    user: session.user,
  });
});

const enrollStart = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { qrDataUrl, manualKey } = await startEnrollment(user.id as string, { ip: req.ip });
  sendResponse(res, 200, "Escanea el código con tu app de autenticación.", { qrDataUrl, manualKey });
});

const enrollComplete = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { code } = req.body as { code: string };
  // The returned document carries the bumped tokenVersion the new session needs.
  const enabled = await completeEnrollment(user.id as string, code, { ip: req.ip });

  const session = await issueSession(enabled, { ip: req.ip });
  res.cookie(challengeCookieName(), "", buildClearChallengeCookieOptions());
  res.cookie(env.cookieName, session.token, buildCookieOptions());
  sendResponse(res, 200, "Verificación en dos pasos activada.", {
    status: "authenticated",
    user: session.user,
  });
});

const setup = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { code } = req.body as { code: string };
  await resetTwoFactor(user.id as string, code, { ip: req.ip });
  // Every session of the account just died, this browser's included.
  res.cookie(env.cookieName, "", buildClearCookieOptions());
  sendResponse(
    res,
    200,
    "Verificación en dos pasos reiniciada. Inicia sesión para configurar tu nueva app.",
  );
});

export { verify, enrollStart, enrollComplete, setup };
