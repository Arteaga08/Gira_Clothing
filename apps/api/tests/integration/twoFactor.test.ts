import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { decryptSecret } from "../../src/utils/crypto.js";
import { UserRole } from "@gira/shared";

const app = buildApp();
const ORIGIN = "http://localhost:3000";

const adminCreds = { name: "Admin", email: "admin@example.com", password: "Segura123" };
const customerCreds = { name: "Cliente", email: "cliente@example.com", password: "Segura123" };

const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw.join(";") : String(raw ?? "");
};

// Creates an admin directly (registration only ever yields customers) and logs in.
const loginAsAdmin = async (): Promise<string> => {
  await User.create({ ...adminCreds, role: UserRole.ADMIN });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: adminCreds.email, password: adminCreds.password });
  return cookieFrom(res);
};

const loginAsCustomer = async (): Promise<string> => {
  await request(app).post("/api/v1/auth/register").send(customerCreds);
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: customerCreds.email, password: customerCreds.password });
  return cookieFrom(res);
};

describe("2FA · setup", () => {
  it("un customer no puede acceder al setup (403)", async () => {
    const cookie = await loginAsCustomer();
    const res = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    expect(res.status).toBe(403);
  });

  it("un admin recibe otpauthUrl y el secreto queda CIFRADO y enabled:false", async () => {
    const cookie = await loginAsAdmin();
    const res = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    const stored = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");
    expect(stored?.twoFactor.enabled).toBe(false);
    // Stored value is the encrypted envelope, not the raw base32 secret.
    expect(stored?.twoFactor.secret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(() => decryptSecret(stored!.twoFactor.secret!)).not.toThrow();
  });
});

describe("2FA · enable", () => {
  let cookie: string;
  let secret: string;

  beforeEach(async () => {
    cookie = await loginAsAdmin();
    const setup = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    // Recover the raw secret from the otpauth URL to generate valid codes.
    secret = new URL(setup.body.data.otpauthUrl).searchParams.get("secret") ?? "";
  });

  it("con código inválido responde 400 y enabled sigue false", async () => {
    const res = await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code: "000000" });
    expect(res.status).toBe(400);
    const stored = await User.findOne({ email: adminCreds.email });
    expect(stored?.twoFactor.enabled).toBe(false);
  });

  it("con código válido responde 200 y enabled:true", async () => {
    const code = authenticator.generate(secret);
    const res = await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code });
    expect(res.status).toBe(200);
    const stored = await User.findOne({ email: adminCreds.email });
    expect(stored?.twoFactor.enabled).toBe(true);
  });
});

describe("2FA · login con segundo factor", () => {
  let secret: string;

  beforeEach(async () => {
    const cookie = await loginAsAdmin();
    const setup = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    secret = new URL(setup.body.data.otpauthUrl).searchParams.get("secret") ?? "";
    const code = authenticator.generate(secret);
    await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code });
  });

  it("sin código responde 401 con error específico de 2FA (no el genérico)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: adminCreds.email, password: adminCreds.password });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/verificación|código/i);
    expect(res.body.message).not.toBe("Correo o contraseña incorrectos.");
  });

  it("con código válido responde 200 y setea cookie", async () => {
    const code = authenticator.generate(secret);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: adminCreds.email, password: adminCreds.password, code });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toContain("gira_session=");
  });
});

describe("2FA · disable", () => {
  let cookie: string;
  let secret: string;

  beforeEach(async () => {
    cookie = await loginAsAdmin();
    const setup = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    secret = new URL(setup.body.data.otpauthUrl).searchParams.get("secret") ?? "";
    const code = authenticator.generate(secret);
    await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code });
  });

  it("sin código válido no se puede desactivar (400)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code: "000000" });
    expect(res.status).toBe(400);
    const stored = await User.findOne({ email: adminCreds.email });
    expect(stored?.twoFactor.enabled).toBe(true);
  });

  it("con código válido desactiva y elimina el secreto", async () => {
    const code = authenticator.generate(secret);
    const res = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code });
    expect(res.status).toBe(200);
    const stored = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");
    expect(stored?.twoFactor.enabled).toBe(false);
    expect(stored?.twoFactor.secret).toBeFalsy();
  });
});

/**
 * `setup` apaga el segundo factor de camino a emitir un secreto nuevo. Sin este
 * guard era una vía de una sola petición para quitar el 2FA de una cuenta
 * admin: exactamente lo que `disable` se niega a hacer sin el código, pero por
 * la otra puerta. Una sesión robada no debe poder desactivarlo por ninguna.
 */
describe("2FA · setup sobre una cuenta que YA tiene el segundo factor activo", () => {
  let cookie: string;
  let secret: string;

  beforeEach(async () => {
    cookie = await loginAsAdmin();
    const setup = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);
    secret = new URL(setup.body.data.otpauthUrl).searchParams.get("secret") ?? "";
    await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code: authenticator.generate(secret) });
  });

  it("sin código responde 400 y el segundo factor sigue activo con su secreto intacto", async () => {
    const before = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");

    const res = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);

    expect(res.status).toBe(400);
    const after = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");
    expect(after?.twoFactor.enabled).toBe(true);
    expect(after?.twoFactor.secret).toBe(before?.twoFactor.secret);
  });

  it("con código incorrecto responde 400 y no rota el secreto", async () => {
    const before = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");

    const res = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code: "000000" });

    expect(res.status).toBe(400);
    const after = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");
    expect(after?.twoFactor.enabled).toBe(true);
    expect(after?.twoFactor.secret).toBe(before?.twoFactor.secret);
  });

  it("con el código vigente sí permite reconfigurar: emite secreto nuevo y vuelve a pendiente", async () => {
    const before = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");

    const res = await request(app)
      .post("/api/v1/auth/2fa/setup")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ code: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    const after = await User.findOne({ email: adminCreds.email }).select("+twoFactor.secret");
    // Vuelve a "pendiente": el alta sigue siendo de dos pasos.
    expect(after?.twoFactor.enabled).toBe(false);
    expect(after?.twoFactor.secret).not.toBe(before?.twoFactor.secret);
  });
});
