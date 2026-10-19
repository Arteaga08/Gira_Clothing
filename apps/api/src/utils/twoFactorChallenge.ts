import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env.js";

/**
 * Short-lived challenge issued after an admin's password check. It proves
 * "this person knew the password a moment ago" and nothing else: it carries
 * no role and no password, and it is signed with a key derived from the
 * session secret plus a label, so a challenge can never be replayed as a
 * session (or the other way round) even though both are HS256 JWTs.
 * The code itself is sent separately, to `/auth/2fa/*`.
 */

type ChallengePurpose = "verify" | "enroll";

interface ChallengePayload {
  sub: string; // user id
  purpose: ChallengePurpose;
  tv: number; // tokenVersion at issue time: revoking sessions also kills open challenges
}

const ALGORITHM = "HS256" as const;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_COOKIE_PATH = "/api/v1/auth/2fa";
const PURPOSES: readonly string[] = ["verify", "enroll"];

const challengeKey = (): Buffer =>
  createHash("sha256").update(`${env.jwtSecret}:2fa-challenge`).digest();

const challengeCookieName = (): string => `${env.cookieName}_2fa`;

const signChallengeToken = (payload: ChallengePayload): string =>
  jwt.sign(payload, challengeKey(), {
    algorithm: ALGORITHM,
    expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000),
  });

const verifyChallengeToken = (token: string): ChallengePayload => {
  const decoded = jwt.verify(token, challengeKey(), { algorithms: [ALGORITHM] });
  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.purpose !== "string" ||
    !PURPOSES.includes(decoded.purpose) ||
    typeof decoded.tv !== "number"
  ) {
    throw new jwt.JsonWebTokenError("Reto inválido");
  }
  return { sub: decoded.sub, purpose: decoded.purpose as ChallengePurpose, tv: decoded.tv };
};

// Scoped to the 2FA routes: the browser never sends it anywhere else.
const buildChallengeCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "strict",
  maxAge: CHALLENGE_TTL_MS,
  path: CHALLENGE_COOKIE_PATH,
});

const buildClearChallengeCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "strict",
  maxAge: 0,
  path: CHALLENGE_COOKIE_PATH,
});

export type { ChallengePayload, ChallengePurpose };
export {
  CHALLENGE_TTL_MS,
  challengeCookieName,
  signChallengeToken,
  verifyChallengeToken,
  buildChallengeCookieOptions,
  buildClearChallengeCookieOptions,
};
