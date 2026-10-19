import type { Request, Response, NextFunction, RequestHandler } from "express";
import { UserRole } from "@gira/shared";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";
import {
  challengeCookieName,
  verifyChallengeToken,
  type ChallengePayload,
  type ChallengePurpose,
} from "../utils/twoFactorChallenge.js";

/**
 * Gate for the routes that finish an admin login. It accepts only the
 * challenge cookie issued after a correct password, for the matching purpose,
 * and loads the user onto req.user. Every failure is the same 401 so a probe
 * learns nothing about why it was refused.
 */

const CHALLENGE_EXPIRED_MESSAGE = "Tu verificación expiró. Inicia sesión de nuevo.";

const readChallenge = (req: Request): ChallengePayload => {
  const cookies = req.cookies as Record<string, string> | undefined;
  const token = cookies?.[challengeCookieName()];
  if (!token) throw new AppError(CHALLENGE_EXPIRED_MESSAGE, 401);
  try {
    return verifyChallengeToken(token);
  } catch {
    throw new AppError(CHALLENGE_EXPIRED_MESSAGE, 401);
  }
};

const requireChallenge = (purpose: ChallengePurpose): RequestHandler =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const payload = readChallenge(req);
    if (payload.purpose !== purpose) throw new AppError(CHALLENGE_EXPIRED_MESSAGE, 401);

    const user = await User.findById(payload.sub);
    // The factor's state must still match the step the challenge was issued
    // for: "verify" needs it on, "enroll" needs it off.
    const stateMatches = user?.twoFactor.enabled === (purpose === "verify");
    if (
      !user ||
      !user.isActive ||
      user.role !== UserRole.ADMIN ||
      payload.tv !== user.tokenVersion ||
      !stateMatches
    ) {
      throw new AppError(CHALLENGE_EXPIRED_MESSAGE, 401);
    }

    req.user = user;
    next();
  });

export { requireChallenge };
