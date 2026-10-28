import { describe, it, expect } from "vitest";
import request from "supertest";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { Session } from "../../src/models/Session.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { ORIGIN, createCustomer, loginCustomer, loginAsAdmin } from "../helpers/auth.js";

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
});
