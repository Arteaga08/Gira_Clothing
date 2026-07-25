import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env.js";

/**
 * JWT session token helpers + secure cookie options.
 * The token travels only in an HttpOnly cookie (never localStorage), so a XSS
 * cannot read it (BACKEND_SECURITY_GUIDELINES §1).
 */

interface AuthTokenPayload {
  sub: string; // user id
  role: string;
}

const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as NonNullable<jwt.SignOptions["expiresIn"]>,
  });

const verifyAuthToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new jwt.JsonWebTokenError("Token inválido");
  }
  return { sub: decoded.sub, role: String(decoded.role) };
};

// Milliseconds for the cookie maxAge, parsed from the same JWT_EXPIRES_IN value.
const parseDurationMs = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000; // safe default: 7 days
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (unitMs[unit as string] ?? unitMs.d!);
};

const buildCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "strict",
  maxAge: parseDurationMs(env.jwtExpiresIn),
  path: "/",
});

// Options for clearing the cookie on logout (same attributes, expired).
const buildClearCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "strict",
  maxAge: 0,
  path: "/",
});

export type { AuthTokenPayload };
export { signAuthToken, verifyAuthToken, buildCookieOptions, buildClearCookieOptions };
