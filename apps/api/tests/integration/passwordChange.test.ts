import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { Session } from "../../src/models/Session.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { hashOneTimeToken } from "../../src/utils/oneTimeToken.js";
import { ORIGIN, createCustomer, loginCustomer, loginAsAdmin } from "../helpers/auth.js";
import { spyOnMailer, sentTo, waitForToken, flushMail } from "../helpers/mail.js";

const app = buildApp();
const NEW_PASSWORD = "NuevaClave2026";

const changePassword = (cookie: string | undefined, body: Record<string, unknown>) => {
  const req = request(app).patch("/api/v1/auth/password").set("Origin", ORIGIN);
  return (cookie ? req.set("Cookie", cookie) : req).send(body);
};
const me = (cookie: string) => request(app).get("/api/v1/auth/me").set("Cookie", cookie);

describe("PATCH /auth/password", () => {
  it("sin sesión responde 401 y un admin 403", async () => {
    expect((await changePassword(undefined, { currentPassword: "x", newPassword: NEW_PASSWORD })).status).toBe(401);
    const admin = await loginAsAdmin(app);
    expect((await changePassword(admin, { currentPassword: "x", newPassword: NEW_PASSWORD })).status).toBe(403);
  });

  it("con la contraseña actual incorrecta responde 400 y no cambia nada", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const res = await changePassword(cookie, { currentPassword: "Incorrecta123", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("La contraseña actual no es correcta.");
    expect((await me(cookie)).status).toBe(200);
    expect(await loginCustomer(app, customer)).not.toBe("");
  });

  it("rechaza una contraseña nueva que no cumple la política", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    for (const newPassword of ["corta1A", "sinmayuscula123", "SINMINUSCULA123", "SinNumeroAquiii", "Ñ".repeat(40) + "a1"]) {
      const res = await changePassword(cookie, { currentPassword: customer.password, newPassword });
      expect(res.status).toBe(400);
    }
  });

  it("cambia la contraseña: la nueva sirve, la vieja no", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const res = await changePassword(cookie, { currentPassword: customer.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    const old = await request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: customer.email, password: customer.password });
    expect(old.status).toBe(401);
    const fresh = await request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: customer.email, password: NEW_PASSWORD });
    expect(fresh.status).toBe(200);
  });

  it("cierra las otras sesiones y conserva la actual sin subir tokenVersion", async () => {
    const customer = await createCustomer();
    const laptop = await loginCustomer(app, customer);
    const phone = await loginCustomer(app, customer);
    const before = await User.findById(customer.id);

    const res = await changePassword(laptop, { currentPassword: customer.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect((await me(laptop)).status).toBe(200);
    expect((await me(phone)).status).toBe(401);
    expect(await Session.countDocuments({ user: customer.id })).toBe(1);
    expect((await User.findById(customer.id))?.tokenVersion).toBe(before?.tokenVersion);
  });

  it("no altera contraseñas con < > &: ni la actual que se compara ni la nueva que se guarda", async () => {
    const customer = await createCustomer({ password: "Vieja<2026>&ab" });
    const cookie = await loginCustomer(app, customer);
    const raw = "Nueva<2026>&Zz";
    const res = await changePassword(cookie, { currentPassword: customer.password, newPassword: raw });
    expect(res.status).toBe(200);

    const login = await request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: customer.email, password: raw });
    expect(login.status).toBe(200);
  });

  it("no altera contraseñas con < > &: ni la actual que se compara ni la nueva que se guarda", async () => {
    const customer = await createCustomer({ password: "Vieja<2026>&ab" });
    const cookie = await loginCustomer(app, customer);
    const raw = "Nueva<2026>&Zz";
    const res = await changePassword(cookie, { currentPassword: customer.password, newPassword: raw });
    expect(res.status).toBe(200);

    const login = await request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: customer.email, password: raw });
    expect(login.status).toBe(200);
  });

  it("deja registro de auditoría sin datos personales", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await changePassword(cookie, { currentPassword: customer.password, newPassword: NEW_PASSWORD });
    const log = await AuditLog.findOne({ action: AuditAction.PASSWORD_CHANGED }).lean();
    expect(log).not.toBeNull();
    expect(String(log?.actorId)).toBe(customer.id);
    expect(JSON.stringify(log)).not.toContain(NEW_PASSWORD);
  });

  it("invalida los enlaces de «olvidé mi contraseña» ya emitidos", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await request(app).post("/api/v1/auth/forgot-password").set("Origin", ORIGIN).send({ email: customer.email });
    const token = await waitForToken(spy, customer.email, "restablecer-contrasena");
    expect(await User.exists({ email: customer.email, "passwordReset.tokenHash": hashOneTimeToken(token) })).not.toBeNull();

    expect((await changePassword(cookie, { currentPassword: customer.password, newPassword: NEW_PASSWORD })).status).toBe(200);

    const stored = await User.findOne({ email: customer.email }).select("+passwordReset");
    expect(stored?.passwordReset).toBeUndefined();
    const reuse = await request(app).post("/api/v1/auth/reset-password").set("Origin", ORIGIN).send({ token, password: "OtraClave2026x" });
    expect(reuse.status).toBe(400);
  });
});

describe("PATCH /auth/password · correo de aviso", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("avisa por correo con el asunto acordado, sin token ni datos del cliente", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    expect((await changePassword(cookie, { currentPassword: customer.password, newPassword: NEW_PASSWORD })).status).toBe(200);

    await vi.waitFor(() => {
      if (sentTo(spy, customer.email).length < 1) throw new Error("correo aún no enviado");
    });
    const mail = sentTo(spy, customer.email)[0]!;
    expect(mail.subject).toBe("Tu contraseña cambió — Gira Clothing");
    const body = `${mail.html}\n${mail.text}`;
    expect(body).toContain("/recuperar-contrasena");
    expect(body).not.toMatch(/token=|[a-f0-9]{64}/);
    expect(body).not.toContain(NEW_PASSWORD);
    expect(body).not.toContain(customer.password);
    expect(body).not.toContain(customer.email);
  });

  it("no manda correo si la contraseña actual es incorrecta", async () => {
    const spy = spyOnMailer();
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await changePassword(cookie, { currentPassword: "Incorrecta123", newPassword: NEW_PASSWORD });
    await flushMail();
    expect(sentTo(spy, customer.email)).toHaveLength(0);
  });

  it("un fallo del proveedor no rompe el cambio de contraseña", async () => {
    const spy = spyOnMailer();
    spy.mockRejectedValue(new Error("proveedor caído"));
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const res = await changePassword(cookie, { currentPassword: customer.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    await flushMail();
    const login = await request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: customer.email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });
});
