import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { AuditAction, UserRole } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { decryptSecret } from "../../src/utils/crypto.js";
import { signAuthToken } from "../../src/utils/token.js";
import { createSession } from "../../src/services/sessionService.js";
import { signChallengeToken, CHALLENGE_TTL_MS } from "../../src/utils/twoFactorChallenge.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import { resetAdminTwoFactorByEmail } from "../../src/services/twoFactorService.js";
import {
  ORIGIN,
  cookieFrom,
  totpFor,
  createAdmin,
  passwordLogin,
  loginAdmin,
  loginAsCustomer,
  type TestAdmin,
} from "../helpers/auth.js";

const app = buildApp();

const CHALLENGE_COOKIE = "gira_session_2fa";
const SESSION_COOKIE = "gira_session";

const post = (path: string, cookie: string, body?: object) => {
  const req = request(app).post(`/api/v1/auth${path}`).set("Origin", ORIGIN).set("Cookie", cookie);
  return body ? req.send(body) : req;
};

const me = (cookie: string) => request(app).get("/api/v1/auth/me").set("Cookie", cookie);

/** A 6-digit code that is NOT valid for the secret in any accepted time step. */
const wrongCode = (secret: string): string => {
  const valid = new Set([-1, 0, 1].map((offset) => totpFor(secret, offset)));
  return ["000000", "111111", "222222", "333333"].find((code) => !valid.has(code)) as string;
};

/** Challenge cookie for an admin who passed the password step. */
const challengeFor = async (admin: TestAdmin): Promise<string> =>
  cookieFrom(await passwordLogin(app, admin));

const tokenOf = (cookie: string, name: string): string =>
  cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${name}=`))
    ?.slice(name.length + 1) as string;

afterEach(() => {
  vi.useRealTimers();
  process.env.RATE_LIMIT_ENABLED = "false";
  resetRateLimitStores();
});

describe("2FA · login de admin (paso de contraseña)", () => {
  it("admin con 2FA activo: 200 two_factor_required, cookie de reto y SIN cookie de sesión", async () => {
    const admin = await createAdmin();
    const res = await passwordLogin(app, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "two_factor_required" });
    const cookie = cookieFrom(res);
    expect(cookie).toContain(`${CHALLENGE_COOKIE}=`);
    expect(cookie).not.toMatch(new RegExp(`(^|; )${SESSION_COOKIE}=`));
  });

  it("admin sin 2FA: 200 enrollment_required y cookie de reto", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const res = await passwordLogin(app, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "enrollment_required" });
    expect(cookieFrom(res)).toContain(`${CHALLENGE_COOKIE}=`);
  });

  it("la cookie de reto es HttpOnly, SameSite=Strict y se limita a /api/v1/auth/2fa", async () => {
    const admin = await createAdmin();
    const res = await passwordLogin(app, admin);
    const raw = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith(`${CHALLENGE_COOKIE}=`),
    ) as string;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/v1\/auth\/2fa/);
  });

  it("contraseña incorrecta sigue siendo 401 genérico y sin cookie de reto", async () => {
    const admin = await createAdmin();
    const res = await passwordLogin(app, { email: admin.email, password: "Equivocada1" });
    expect(res.status).toBe(401);
    expect(cookieFrom(res)).not.toContain(CHALLENGE_COOKIE);
  });

  it("un customer sigue recibiendo sesión directa", async () => {
    const cookie = await loginAsCustomer(app);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect((await me(cookie)).status).toBe(200);
  });

  it("el login ya no acepta `code`: se descarta y no cambia el resultado", async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: admin.email, password: admin.password, code: totpFor(admin.secret) });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "two_factor_required" });
  });

  it("seis logins con contraseña correcta NO disparan el límite de login (residual de M8.3)", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
    const admin = await createAdmin();
    for (let i = 0; i < 6; i += 1) {
      const res = await passwordLogin(app, admin);
      expect(res.status).toBe(200);
    }
  });
});

describe("2FA · protect exige el segundo factor al admin", () => {
  it("un admin sin 2FA no pasa protect aunque tenga un JWT de sesión válido", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const sid = await createSession(admin.id);
    const token = signAuthToken({ sub: admin.id, role: UserRole.ADMIN, tv: 0, sid });
    const res = await me(`${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/dos pasos/i);
  });

  it("un admin con 2FA activo y sesión completa sí pasa", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    expect((await me(cookie)).status).toBe(200);
  });
});

describe("2FA · verify (admin con factor activo)", () => {
  it("con código válido: 200, cookie de sesión funcional y cookie de reto limpiada", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    const res = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(admin.email);
    const raw = (res.headers["set-cookie"] as unknown as string[]).join("\n");
    expect(raw).toMatch(new RegExp(`${CHALLENGE_COOKIE}=;`));
    expect((await me(cookieFrom(res))).status).toBe(200);
  });

  it("con código incorrecto: 400 y sin sesión", async () => {
    const admin = await createAdmin();
    const res = await post("/2fa/verify", await challengeFor(admin), {
      code: wrongCode(admin.secret),
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("El código de verificación es incorrecto.");
    expect(cookieFrom(res)).not.toContain(`${SESSION_COOKIE}=`);
  });

  it("sin cookie de reto: 401", async () => {
    const res = await post("/2fa/verify", "", { code: "123456" });
    expect(res.status).toBe(401);
  });

  it("código con formato inválido: 400 de validación", async () => {
    const admin = await createAdmin();
    const res = await post("/2fa/verify", await challengeFor(admin), { code: "12ab" });
    expect(res.status).toBe(400);
  });

  it("reto expirado: 401", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + CHALLENGE_TTL_MS + 5000);
    const res = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(res.status).toBe(401);
  });

  it("reto con tokenVersion vieja (sesiones revocadas después): 401", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    await User.updateOne({ _id: admin.id }, { $inc: { tokenVersion: 1 } });
    const res = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(res.status).toBe(401);
  });

  it("un reto de enrolamiento no sirve en verify (propósito distinto)", async () => {
    const admin = await createAdmin();
    const wrongPurpose = signChallengeToken({ sub: admin.id, purpose: "enroll", tv: 0 });
    const res = await post("/2fa/verify", `${CHALLENGE_COOKIE}=${wrongPurpose}`, {
      code: totpFor(admin.secret),
    });
    expect(res.status).toBe(401);
  });

  it("una cookie de sesión puesta como cookie de reto no sirve", async () => {
    const admin = await createAdmin();
    const session = await loginAdmin(app, admin);
    const asChallenge = `${CHALLENGE_COOKIE}=${tokenOf(session, SESSION_COOKIE)}`;
    const res = await post("/2fa/verify", asChallenge, { code: totpFor(admin.secret, 1) });
    expect(res.status).toBe(401);
  });

  it("un token de reto puesto como cookie de sesión no abre /auth/me", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    const asSession = `${SESSION_COOKIE}=${tokenOf(challenge, CHALLENGE_COOKIE)}`;
    expect((await me(asSession)).status).toBe(401);
  });

  it("un customer no puede usar verify aunque tenga un reto firmado a su nombre", async () => {
    await loginAsCustomer(app);
    const customer = await User.findOne({ role: UserRole.CUSTOMER });
    const token = signChallengeToken({ sub: customer!.id as string, purpose: "verify", tv: 0 });
    const res = await post("/2fa/verify", `${CHALLENGE_COOKIE}=${token}`, { code: "123456" });
    expect(res.status).toBe(401);
  });
});

describe("2FA · anti-replay (lastUsedStep)", () => {
  it("el mismo código no se acepta dos veces", async () => {
    const admin = await createAdmin();
    const code = totpFor(admin.secret);
    const first = await post("/2fa/verify", await challengeFor(admin), { code });
    expect(first.status).toBe(200);
    const second = await post("/2fa/verify", await challengeFor(admin), { code });
    expect(second.status).toBe(400);
  });

  it("dos requests simultáneos con el mismo código: solo uno entra", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    const code = totpFor(admin.secret);
    const results = await Promise.all([
      post("/2fa/verify", challenge, { code }),
      post("/2fa/verify", challenge, { code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("un código de un paso anterior al último usado tampoco se acepta", async () => {
    const admin = await createAdmin();
    const ok = await post("/2fa/verify", await challengeFor(admin), {
      code: totpFor(admin.secret, 1),
    });
    expect(ok.status).toBe(200);
    const older = await post("/2fa/verify", await challengeFor(admin), {
      code: totpFor(admin.secret, 0),
    });
    expect(older.status).toBe(400);
  });
});

describe("2FA · bloqueo por intentos", () => {
  it("5 códigos incorrectos bloquean 15 min: ni el correcto entra, y se audita", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    for (let i = 0; i < 5; i += 1) {
      const res = await post("/2fa/verify", challenge, { code: wrongCode(admin.secret) });
      expect(res.status).toBe(400);
    }

    const blocked = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Demasiados códigos incorrectos/);

    const user = await User.findById(admin.id);
    const remaining = user!.twoFactor.lockedUntil!.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(14 * 60 * 1000);
    expect(remaining).toBeLessThanOrEqual(15 * 60 * 1000);

    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_FAILED })).toBe(5);
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_LOCKED })).toBe(1);
  });

  it("intentos incorrectos EN PARALELO no saltan el bloqueo: se evalúan 5, el resto recibe 429", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => post("/2fa/verify", challenge, { code: wrongCode(admin.secret) })),
    );
    expect(results.filter((r) => r.status === 400)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(15);
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_FAILED })).toBe(5);
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_LOCKED })).toBe(1);

    const correct = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(correct.status).toBe(429);
  });

  it("al vencer el bloqueo vuelve a aceptar el código correcto", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    for (let i = 0; i < 5; i += 1) {
      await post("/2fa/verify", challenge, { code: wrongCode(admin.secret) });
    }
    await User.updateOne({ _id: admin.id }, { $set: { "twoFactor.lockedUntil": new Date(Date.now() - 1000) } });
    const res = await post("/2fa/verify", challenge, { code: totpFor(admin.secret) });
    expect(res.status).toBe(200);
  });

  it("un código correcto reinicia el contador de fallos", async () => {
    const admin = await createAdmin();
    const challenge = await challengeFor(admin);
    for (let i = 0; i < 4; i += 1) {
      await post("/2fa/verify", challenge, { code: wrongCode(admin.secret) });
    }
    expect((await post("/2fa/verify", challenge, { code: totpFor(admin.secret) })).status).toBe(200);
    expect((await User.findById(admin.id))!.twoFactor.failedAttempts).toBe(0);
  });

  it("el bloqueo es por cuenta: otro admin no se ve afectado", async () => {
    const locked = await createAdmin();
    const other = await createAdmin();
    const challenge = await challengeFor(locked);
    for (let i = 0; i < 5; i += 1) {
      await post("/2fa/verify", challenge, { code: wrongCode(locked.secret) });
    }
    const res = await post("/2fa/verify", await challengeFor(other), { code: totpFor(other.secret) });
    expect(res.status).toBe(200);
  });
});

describe("2FA · limiter de /2fa/* por IP", () => {
  it("10 fallos desde una IP bloquean cualquier intento siguiente con 429 del limiter", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
    // 5 admins × 2 fallos: ninguno llega al bloqueo por cuenta (5), sólo cuenta la IP.
    const admins = await Promise.all([1, 2, 3, 4, 5].map(() => createAdmin()));
    for (const admin of admins) {
      const challenge = await challengeFor(admin);
      for (let i = 0; i < 2; i += 1) {
        const res = await post("/2fa/verify", challenge, { code: wrongCode(admin.secret) });
        expect(res.status).toBe(400);
      }
    }
    const extra = await createAdmin();
    const res = await post("/2fa/verify", await challengeFor(extra), { code: totpFor(extra.secret) });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/desde esta dirección/);
  });

  it("los códigos correctos no consumen el límite", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
    for (let i = 0; i < 12; i += 1) {
      const admin = await createAdmin();
      const res = await post("/2fa/verify", await challengeFor(admin), { code: totpFor(admin.secret) });
      expect(res.status).toBe(200);
    }
  });
});

describe("2FA · enrolamiento (admin sin factor)", () => {
  it("enroll/start devuelve QR PNG y clave manual; el secreto queda cifrado y pendiente", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const res = await post("/2fa/enroll/start", await challengeFor(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const { manualKey } = res.body.data as { manualKey: string };
    expect(manualKey).toMatch(/^[A-Z2-7]+$/);

    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(user!.twoFactor.enabled).toBe(false);
    expect(user!.twoFactor.secret).toBeDefined();
    expect(user!.twoFactor.secret).not.toContain(manualKey);
    expect(decryptSecret(user!.twoFactor.secret!)).toBe(manualKey);
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_SETUP })).toBe(1);
  });

  it("enroll/start repetido devuelve el MISMO secreto pendiente (no invalida el QR ya escaneado)", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const challenge = await challengeFor(admin);
    const a = await post("/2fa/enroll/start", challenge);
    const b = await post("/2fa/enroll/start", challenge);
    expect(b.status).toBe(200);
    expect(b.body.data.manualKey).toBe(a.body.data.manualKey);
    expect(b.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("dos enroll/start simultáneos terminan con un solo secreto, el mismo en ambas respuestas", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const challenge = await challengeFor(admin);
    const [a, b] = await Promise.all([
      post("/2fa/enroll/start", challenge),
      post("/2fa/enroll/start", challenge),
    ]);
    expect(a.body.data.manualKey).toBe(b.body.data.manualKey);
    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(decryptSecret(user!.twoFactor.secret!)).toBe(a.body.data.manualKey);
  });

  it("enroll/complete con código válido activa el factor, sube tokenVersion y abre sesión", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const challenge = await challengeFor(admin);
    const start = await post("/2fa/enroll/start", challenge);
    const res = await post("/2fa/enroll/complete", challenge, {
      code: totpFor(start.body.data.manualKey),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.twoFactorEnabled).toBe(true);
    expect((await me(cookieFrom(res))).status).toBe(200);

    const user = await User.findById(admin.id);
    expect(user!.twoFactor.enabled).toBe(true);
    expect(user!.tokenVersion).toBe(1);
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_ENABLED })).toBe(1);
  });

  it("enroll/complete con código inválido: 400 y el factor sigue pendiente", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const challenge = await challengeFor(admin);
    const start = await post("/2fa/enroll/start", challenge);
    const res = await post("/2fa/enroll/complete", challenge, {
      code: wrongCode(start.body.data.manualKey),
    });
    expect(res.status).toBe(400);
    expect((await User.findById(admin.id))!.twoFactor.enabled).toBe(false);
  });

  it("enroll/complete sin haber pedido start: 400", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const res = await post("/2fa/enroll/complete", await challengeFor(admin), { code: "123456" });
    expect(res.status).toBe(400);
  });

  it("el reto de enrolamiento muere al completar (tokenVersion cambió)", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const challenge = await challengeFor(admin);
    const start = await post("/2fa/enroll/start", challenge);
    await post("/2fa/enroll/complete", challenge, { code: totpFor(start.body.data.manualKey) });
    const replay = await post("/2fa/enroll/start", challenge);
    expect(replay.status).toBe(401);
  });

  it("un admin que YA tiene el factor no puede re-enrolar con un reto (401)", async () => {
    const admin = await createAdmin();
    const token = signChallengeToken({ sub: admin.id, purpose: "enroll", tv: 0 });
    const res = await post("/2fa/enroll/start", `${CHALLENGE_COOKIE}=${token}`);
    expect(res.status).toBe(401);
    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(decryptSecret(user!.twoFactor.secret!)).toBe(admin.secret);
  });

  it("un reto de verificación no sirve para enrolar", async () => {
    const admin = await createAdmin({ twoFactorEnabled: false });
    const token = signChallengeToken({ sub: admin.id, purpose: "verify", tv: 0 });
    const res = await post("/2fa/enroll/start", `${CHALLENGE_COOKIE}=${token}`);
    expect(res.status).toBe(401);
  });

  it("el secreto TOTP nunca aparece en la respuesta de /auth/me", async () => {
    const admin = await createAdmin();
    const res = await me(await loginAdmin(app, admin));
    expect(JSON.stringify(res.body)).not.toContain(admin.secret);
    expect(res.body.data.user).not.toHaveProperty("twoFactor");
  });
});

describe("2FA · setup (reiniciar el factor con el código vigente)", () => {
  it("sin código: 400", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    const res = await post("/2fa/setup", cookie, {});
    expect(res.status).toBe(400);
  });

  it("con código incorrecto: 400 y el factor sigue intacto", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    const res = await post("/2fa/setup", cookie, { code: wrongCode(admin.secret) });
    expect(res.status).toBe(400);
    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(user!.twoFactor.enabled).toBe(true);
    expect(decryptSecret(user!.twoFactor.secret!)).toBe(admin.secret);
  });

  it("con código vigente: apaga el factor, revoca la sesión y el siguiente login pide enrolar", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    const res = await post("/2fa/setup", cookie, { code: totpFor(admin.secret, 1) });
    expect(res.status).toBe(200);

    expect((await me(cookie)).status).toBe(401);
    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(user!.twoFactor.enabled).toBe(false);
    expect(user!.twoFactor.secret).toBeUndefined();
    expect(user!.twoFactor.lastUsedStep).toBeUndefined();
    expect((await passwordLogin(app, admin)).body.data).toEqual({ status: "enrollment_required" });
    expect(await AuditLog.countDocuments({ action: AuditAction.TWO_FACTOR_RESET })).toBe(1);
  });

  it("un customer recibe 403", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await post("/2fa/setup", cookie, { code: "123456" });
    expect(res.status).toBe(403);
  });

  it("/2fa/enable y /2fa/disable ya no existen", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    expect((await post("/2fa/enable", cookie, { code: "123456" })).status).toBe(404);
    expect((await post("/2fa/disable", cookie, { code: "123456" })).status).toBe(404);
  });
});

describe("2FA · recuperación por script (resetAdminTwoFactorByEmail)", () => {
  it("reinicia el factor, revoca sesiones y audita con actor system", async () => {
    const admin = await createAdmin();
    const cookie = await loginAdmin(app, admin);
    await resetAdminTwoFactorByEmail(admin.email);

    expect((await me(cookie)).status).toBe(401);
    const user = await User.findById(admin.id).select("+twoFactor.secret");
    expect(user!.twoFactor.enabled).toBe(false);
    expect(user!.twoFactor.secret).toBeUndefined();
    expect(user!.twoFactor.failedAttempts).toBe(0);
    expect(user!.twoFactor.lockedUntil).toBeUndefined();
    const entry = await AuditLog.findOne({ action: AuditAction.TWO_FACTOR_RESET });
    expect(entry!.actorType).toBe("system");
  });

  it("también destraba una cuenta bloqueada", async () => {
    const admin = await createAdmin();
    await User.updateOne({ _id: admin.id }, { $set: { "twoFactor.lockedUntil": new Date(Date.now() + 60_000) } });
    await resetAdminTwoFactorByEmail(admin.email);
    expect((await passwordLogin(app, admin)).body.data).toEqual({ status: "enrollment_required" });
  });

  it("rechaza a un customer", async () => {
    await loginAsCustomer(app);
    const customer = await User.findOne({ role: UserRole.CUSTOMER });
    await expect(resetAdminTwoFactorByEmail(customer!.email)).rejects.toThrow();
  });

  it("rechaza un correo inexistente", async () => {
    await expect(resetAdminTwoFactorByEmail("nadie@example.com")).rejects.toThrow();
  });
});
