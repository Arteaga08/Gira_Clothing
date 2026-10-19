import { describe, it, expect, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  signChallengeToken,
  verifyChallengeToken,
  challengeCookieName,
  buildChallengeCookieOptions,
  CHALLENGE_TTL_MS,
} from "../../src/utils/twoFactorChallenge.js";
import { signAuthToken, verifyAuthToken } from "../../src/utils/token.js";
import { env } from "../../src/config/env.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("twoFactorChallenge · token", () => {
  it("firma y verifica sub, propósito y tokenVersion", () => {
    const token = signChallengeToken({ sub: "u1", purpose: "verify", tv: 3 });
    expect(verifyChallengeToken(token)).toEqual({ sub: "u1", purpose: "verify", tv: 3 });
  });

  it("no lleva contraseña ni rol: solo sub, purpose y tv", () => {
    const token = signChallengeToken({ sub: "u1", purpose: "enroll", tv: 0 });
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(["exp", "iat", "purpose", "sub", "tv"]);
  });

  it("caduca a los 5 minutos", () => {
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    vi.useFakeTimers({ toFake: ["Date"] });
    const token = signChallengeToken({ sub: "u1", purpose: "verify", tv: 0 });
    vi.setSystemTime(Date.now() + CHALLENGE_TTL_MS + 1000);
    expect(() => verifyChallengeToken(token)).toThrow();
  });

  it("un token de sesión NO sirve como reto (clave separada)", () => {
    const session = signAuthToken({ sub: "u1", role: "admin", tv: 0, sid: "s1" });
    expect(() => verifyChallengeToken(session)).toThrow();
  });

  it("un token de reto NO sirve como sesión (clave separada)", () => {
    const challenge = signChallengeToken({ sub: "u1", purpose: "verify", tv: 0 });
    expect(() => verifyAuthToken(challenge)).toThrow();
  });

  it("rechaza un propósito desconocido aunque la firma sea válida", () => {
    const bad = signChallengeToken({ sub: "u1", purpose: "admin" as never, tv: 0 });
    expect(() => verifyChallengeToken(bad)).toThrow();
  });
});

describe("twoFactorChallenge · cookie", () => {
  it("usa el nombre de la cookie de sesión con sufijo _2fa", () => {
    expect(challengeCookieName()).toBe(`${env.cookieName}_2fa`);
  });

  it("es HttpOnly, SameSite=strict, de 5 min y limitada a /api/v1/auth/2fa", () => {
    const options = buildChallengeCookieOptions();
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      maxAge: 5 * 60 * 1000,
      path: "/api/v1/auth/2fa",
    });
  });
});
