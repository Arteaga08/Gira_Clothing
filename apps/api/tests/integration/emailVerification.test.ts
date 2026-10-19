import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { ORIGIN, createCustomer } from "../helpers/auth.js";
import { spyOnMailer, sentTo, waitForToken, flushMail, type MailSpy } from "../helpers/mail.js";

const app = buildApp();

const signup = {
  firstName: "Ana",
  lastName: "López",
  email: "ana@example.com",
  password: "Segura1234",
};

const post = (path: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/auth/${path}`).set("Origin", ORIGIN).send(body);

/** Registers and returns the raw token from the activation email. */
const registerAndGetToken = async (spy: MailSpy): Promise<string> => {
  await post("register", signup);
  return waitForToken(spy, signup.email, "verificar-correo");
};

const expireCooldown = () =>
  User.updateOne(
    { email: signup.email },
    { $set: { "emailVerification.issuedAt": new Date(Date.now() - 61_000) } },
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verify-email", () => {
  it("token + contraseña correctos activan la cuenta, gastan el token, no abren sesión y se audita", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);

    const res = await post("verify-email", { token, password: signup.password });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();

    const user = await User.findOne({ email: signup.email }).select("+emailVerification");
    expect(user!.emailVerified).toBe(true);
    expect(user!.emailVerification?.tokenHash).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: AuditAction.EMAIL_VERIFIED })).toBe(1);

    const login = await post("login", { email: signup.email, password: signup.password });
    expect(login.status).toBe(200);
  });

  it("el token ya usado responde 400", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);
    await post("verify-email", { token, password: signup.password });
    const again = await post("verify-email", { token, password: signup.password });
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/no es válido o ya venció/);
  });

  it("contraseña incorrecta: 401 SIN gastar el token (sirve después con la correcta)", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);

    const wrong = await post("verify-email", { token, password: "Incorrecta123" });
    expect(wrong.status).toBe(401);
    expect((await User.findOne({ email: signup.email }))!.emailVerified).toBe(false);

    expect((await post("verify-email", { token, password: signup.password })).status).toBe(200);
  });

  it("token vencido (más de 24 h) responde 400", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);
    await User.updateOne(
      { email: signup.email },
      { $set: { "emailVerification.expiresAt": new Date(Date.now() - 1000) } },
    );
    expect((await post("verify-email", { token, password: signup.password })).status).toBe(400);
  });

  it("token con formato inválido o sin contraseña: 400 de validación", async () => {
    expect((await post("verify-email", { token: "abc", password: "x" })).status).toBe(400);
    expect((await post("verify-email", { token: "a".repeat(64) })).status).toBe(400);
  });

  it("una cuenta desactivada no se activa con su enlace", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);
    await User.updateOne({ email: signup.email }, { isActive: false });
    expect((await post("verify-email", { token, password: signup.password })).status).toBe(400);
  });

  it("un token inexistente responde 400", async () => {
    expect((await post("verify-email", { token: "a".repeat(64), password: "x" })).status).toBe(400);
  });

  it("dos verificaciones simultáneas con el mismo token: exactamente una gana", async () => {
    const spy = spyOnMailer();
    const token = await registerAndGetToken(spy);
    const results = await Promise.all([
      post("verify-email", { token, password: signup.password }),
      post("verify-email", { token, password: signup.password }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);
    expect(await AuditLog.countDocuments({ action: AuditAction.EMAIL_VERIFIED })).toBe(1);
  });
});

describe("resend-verification", () => {
  it("responde lo mismo para un correo inexistente, uno verificado y uno pendiente", async () => {
    const verified = await createCustomer({ email: "verificada@example.com" });
    await createCustomer({ email: "pendiente@example.com", emailVerified: false });

    const nobody = await post("resend-verification", { email: "nadie@example.com" });
    const done = await post("resend-verification", { email: verified.email });
    const pending = await post("resend-verification", { email: "pendiente@example.com" });

    expect(nobody.status).toBe(200);
    expect(done.body).toEqual(nobody.body);
    expect(pending.body).toEqual(nobody.body);
  });

  it("solo manda correo a la cuenta pendiente", async () => {
    const spy = spyOnMailer();
    const verified = await createCustomer({ email: "verificada@example.com" });
    await createCustomer({ email: "pendiente@example.com", emailVerified: false });

    await post("resend-verification", { email: verified.email });
    await post("resend-verification", { email: "nadie@example.com" });
    await post("resend-verification", { email: "pendiente@example.com" });

    await waitForToken(spy, "pendiente@example.com", "verificar-correo");
    await flushMail();
    expect(sentTo(spy, verified.email)).toHaveLength(0);
    expect(sentTo(spy, "nadie@example.com")).toHaveLength(0);
  });

  it("respeta el enfriamiento de 60 s: un reenvío inmediato no manda otro correo", async () => {
    const spy = spyOnMailer();
    await registerAndGetToken(spy);
    const res = await post("resend-verification", { email: signup.email });
    expect(res.status).toBe(200);
    await flushMail();
    expect(sentTo(spy, signup.email)).toHaveLength(1);
  });

  it("pasado el enfriamiento manda un enlace nuevo y el anterior deja de servir", async () => {
    const spy = spyOnMailer();
    const oldToken = await registerAndGetToken(spy);
    await expireCooldown();

    await post("resend-verification", { email: signup.email });
    const newToken = await waitForToken(spy, signup.email, "verificar-correo", 2);
    expect(newToken).not.toBe(oldToken);

    expect((await post("verify-email", { token: oldToken, password: signup.password })).status).toBe(400);
    expect((await post("verify-email", { token: newToken, password: signup.password })).status).toBe(200);
  });

  it("una cuenta desactivada no recibe enlace", async () => {
    const spy = spyOnMailer();
    await createCustomer({ email: "baja@example.com", emailVerified: false });
    await User.updateOne({ email: "baja@example.com" }, { isActive: false });
    await post("resend-verification", { email: "baja@example.com" });
    await flushMail();
    expect(sentTo(spy, "baja@example.com")).toHaveLength(0);
  });
});
