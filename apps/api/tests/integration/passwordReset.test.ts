import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { hashOneTimeToken } from "../../src/utils/oneTimeToken.js";
import { ORIGIN, createCustomer, loginCustomer, type TestCustomer } from "../helpers/auth.js";
import { spyOnMailer, sentTo, waitForToken, flushMail, type MailSpy } from "../helpers/mail.js";

const app = buildApp();
const NEW_PASSWORD = "NuevaClave99";

const post = (path: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/auth/${path}`).set("Origin", ORIGIN).send(body);

const me = (cookie: string) => request(app).get("/api/v1/auth/me").set("Cookie", cookie);

const requestReset = async (spy: MailSpy, customer: TestCustomer, count = 1): Promise<string> => {
  await post("forgot-password", { email: customer.email });
  return waitForToken(spy, customer.email, "restablecer-contrasena", count);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forgot-password", () => {
  it("responde lo mismo exista o no el correo, y solo manda correo si existe", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();

    const known = await post("forgot-password", { email: customer.email });
    const unknown = await post("forgot-password", { email: "nadie@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);

    const token = await waitForToken(spy, customer.email, "restablecer-contrasena");
    await flushMail();
    expect(sentTo(spy, "nadie@example.com")).toHaveLength(0);

    const stored = await User.findOne({ email: customer.email }).select("+passwordReset");
    expect(stored!.passwordReset!.tokenHash).toBe(hashOneTimeToken(token));
    const ttl = stored!.passwordReset!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(await AuditLog.countDocuments({ action: AuditAction.PASSWORD_RESET_REQUESTED })).toBe(1);
  });

  it("respeta el enfriamiento de 60 s", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    await requestReset(spy, customer);
    expect((await post("forgot-password", { email: customer.email })).status).toBe(200);
    await flushMail();
    expect(sentTo(spy, customer.email)).toHaveLength(1);
  });

  it("una cuenta desactivada no recibe enlace", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    await User.updateOne({ email: customer.email }, { isActive: false });
    await post("forgot-password", { email: customer.email });
    await flushMail();
    expect(sentTo(spy, customer.email)).toHaveLength(0);
  });
});

describe("reset-password", () => {
  it("cambia la contraseña, cierra todas las sesiones previas, no abre una nueva y se audita", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const phone = await loginCustomer(app, customer);
    const laptop = await loginCustomer(app, customer);
    const before = await User.findOne({ email: customer.email });

    const token = await requestReset(spy, customer);
    const res = await post("reset-password", { token, password: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();

    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(401);
    const after = await User.findOne({ email: customer.email });
    expect(after!.tokenVersion).toBe(before!.tokenVersion + 1);

    expect((await post("login", { email: customer.email, password: customer.password })).status).toBe(401);
    expect((await post("login", { email: customer.email, password: NEW_PASSWORD })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: AuditAction.PASSWORD_RESET_COMPLETED })).toBe(1);
  });

  it("el token es de un solo uso", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(200);
    expect((await post("reset-password", { token, password: "OtraClave123" })).status).toBe(400);
  });

  it("dos resets simultáneos con el mismo token: exactamente uno gana", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    const results = await Promise.all([
      post("reset-password", { token, password: NEW_PASSWORD }),
      post("reset-password", { token, password: "OtraClave123" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("vence a la hora", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    await User.updateOne(
      { email: customer.email },
      { $set: { "passwordReset.expiresAt": new Date(Date.now() - 1000) } },
    );
    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(400);
  });

  it("pedir otro enlace (pasado el enfriamiento) invalida el anterior", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const oldToken = await requestReset(spy, customer);
    await User.updateOne(
      { email: customer.email },
      { $set: { "passwordReset.issuedAt": new Date(Date.now() - 61_000) } },
    );
    const newToken = await requestReset(spy, customer, 2);
    expect((await post("reset-password", { token: oldToken, password: NEW_PASSWORD })).status).toBe(400);
    expect((await post("reset-password", { token: newToken, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("la contraseña nueva debe cumplir la política", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    expect((await post("reset-password", { token, password: "corta1A" })).status).toBe(400);
    // The failed validation did not spend the token.
    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("una cuenta sin verificar queda verificada al restablecer (probó que controla el buzón)", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer({ emailVerified: false });
    const token = await requestReset(spy, customer);
    await post("reset-password", { token, password: NEW_PASSWORD });
    const after = await User.findOne({ email: customer.email }).select("+emailVerification");
    expect(after!.emailVerified).toBe(true);
    expect(after!.emailVerification?.tokenHash).toBeUndefined();
    expect((await post("login", { email: customer.email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("es atómico: un documento al que le faltan campos (admin legado) igual cambia la contraseña y gasta el token", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    // Legacy shape: no lastName. A save() would fail validation after the token was spent.
    await User.collection.updateOne({ email: customer.email }, { $unset: { lastName: "" } });

    const res = await post("reset-password", { token, password: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(400);
    const raw = await User.collection.findOne({ email: customer.email });
    expect(raw).not.toHaveProperty("passwordReset");
  });

  it("una cuenta desactivada no puede usar un enlace que ya tenía", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const token = await requestReset(spy, customer);
    await User.updateOne({ email: customer.email }, { isActive: false });
    expect((await post("reset-password", { token, password: NEW_PASSWORD })).status).toBe(400);
  });
});
