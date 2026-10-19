import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { getMailer } from "../../src/adapters/mailer/index.js";
import { hashOneTimeToken } from "../../src/utils/oneTimeToken.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import { ORIGIN, createCustomer, loginCustomer } from "../helpers/auth.js";
import { spyOnMailer, sentTo, waitForToken, flushMail } from "../helpers/mail.js";

const app = buildApp();

const validUser = {
  firstName: "Ana",
  lastName: "López",
  email: "ana@example.com",
  password: "Segura1234",
};

const register = (body: Record<string, unknown> = validUser) =>
  request(app).post("/api/v1/auth/register").set("Origin", ORIGIN).send(body);

const login = (email: string, password: string) =>
  request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email, password });

/** Moves the last issued link of a kind past the 60 s cooldown. */
const expireCooldown = (email: string, kind: "emailVerification" | "passwordReset") =>
  User.updateOne({ email }, { $set: { [`${kind}.issuedAt`]: new Date(Date.now() - 61_000) } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Auth · registro", () => {
  it("responde 201 genérico, sin usuario, sin password y SIN cookie de sesión", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data ?? {}).not.toHaveProperty("user");
    expect(JSON.stringify(res.body)).not.toContain(validUser.password);
    expect(res.headers["set-cookie"]).toBeUndefined();

    const stored = await User.findOne({ email: validUser.email });
    expect(stored?.role).toBe("customer");
    expect(stored?.emailVerified).toBe(false);
    expect(stored?.firstName).toBe("Ana");
    expect(stored?.lastName).toBe("López");
  });

  it("manda el enlace de activación y en la DB solo queda el hash del token", async () => {
    const spy = spyOnMailer();
    await register();
    const token = await waitForToken(spy, validUser.email, "verificar-correo");

    const stored = await User.findOne({ email: validUser.email }).select("+emailVerification");
    expect(stored!.emailVerification!.tokenHash).toBe(hashOneTimeToken(token));
    expect(JSON.stringify(stored!.toObject())).not.toContain(token);
    const ttl = stored!.emailVerification!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("correo ya verificado: mismo 201, sin correo, sin cambiar la contraseña y pagando bcrypt", async () => {
    const first = await register();
    await User.updateOne({ email: validUser.email }, { emailVerified: true });

    const spy = spyOnMailer();
    const hashSpy = vi.spyOn(bcrypt, "hash");
    const second = await register({ ...validUser, password: "OtraClave123" });
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(hashSpy).toHaveBeenCalledTimes(1);
    await flushMail();
    expect(sentTo(spy, validUser.email)).toHaveLength(0);

    expect(await User.countDocuments({ email: validUser.email })).toBe(1);
    const stored = await User.findOne({ email: validUser.email }).select("+password");
    expect(await bcrypt.compare(validUser.password, stored!.password)).toBe(true);
  });

  it("un admin con ese correo tampoco se toca", async () => {
    await User.create({
      firstName: "Admin",
      lastName: "Gira",
      email: validUser.email,
      password: "Admin12345",
      role: "admin",
      emailVerified: true,
    });
    const spy = spyOnMailer();
    expect((await register()).status).toBe(201);
    await flushMail();
    expect(sentTo(spy, validUser.email)).toHaveLength(0);
    const stored = await User.findOne({ email: validUser.email }).select("+password");
    expect(stored!.role).toBe("admin");
    expect(await bcrypt.compare("Admin12345", stored!.password)).toBe(true);
  });

  it("correo sin verificar: reemplaza contraseña y nombres, manda enlace nuevo e invalida el anterior", async () => {
    const spy = spyOnMailer();
    await register();
    const oldToken = await waitForToken(spy, validUser.email, "verificar-correo");
    await expireCooldown(validUser.email, "emailVerification");

    await register({ ...validUser, firstName: "Ana María", password: "NuevaClave99" });
    const newToken = await waitForToken(spy, validUser.email, "verificar-correo", 2);
    expect(newToken).not.toBe(oldToken);

    const stored = await User.findOne({ email: validUser.email }).select("+password");
    expect(stored!.firstName).toBe("Ana María");
    expect(await bcrypt.compare("NuevaClave99", stored!.password)).toBe(true);

    const withOld = await request(app)
      .post("/api/v1/auth/verify-email")
      .set("Origin", ORIGIN)
      .send({ token: oldToken, password: "NuevaClave99" });
    expect(withOld.status).toBe(400);
  });

  it("sin verificar y dentro del enfriamiento de 60 s: cambia la contraseña pero no manda otro correo", async () => {
    const spy = spyOnMailer();
    await register();
    await waitForToken(spy, validUser.email, "verificar-correo");

    expect((await register({ ...validUser, password: "NuevaClave99" })).status).toBe(201);
    await flushMail();
    expect(sentTo(spy, validUser.email)).toHaveLength(1);
    const stored = await User.findOne({ email: validUser.email }).select("+password");
    expect(await bcrypt.compare("NuevaClave99", stored!.password)).toBe(true);
  });

  it("una cuenta desactivada sin verificar no se toca ni recibe correo", async () => {
    const spy = spyOnMailer();
    await register();
    await waitForToken(spy, validUser.email, "verificar-correo");
    await User.updateOne(
      { email: validUser.email },
      { isActive: false, $set: { "emailVerification.issuedAt": new Date(Date.now() - 61_000) } },
    );
    await register({ ...validUser, password: "NuevaClave99" });
    await flushMail();
    expect(sentTo(spy, validUser.email)).toHaveLength(1);
    const stored = await User.findOne({ email: validUser.email }).select("+password");
    expect(await bcrypt.compare(validUser.password, stored!.password)).toBe(true);
  });

  it("si el proveedor de correo falla, el registro igual responde 201", async () => {
    vi.spyOn(getMailer(), "send").mockRejectedValue(new Error("Resend caído"));
    const res = await register();
    await flushMail();
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ email: validUser.email })).toBe(1);
  });

  it("ignora un intento de mass assignment de role y emailVerified", async () => {
    const res = await register({ ...validUser, role: "admin", emailVerified: true });
    expect(res.status).toBe(201);
    const stored = await User.findOne({ email: validUser.email });
    expect(stored?.role).toBe("customer");
    expect(stored?.emailVerified).toBe(false);
  });

  it("rechaza una contraseña fuera de la política con 400", async () => {
    expect((await register({ ...validUser, password: "Segura123" })).status).toBe(400);
  });

  it("rechaza el registro sin nombre o apellido", async () => {
    const { lastName: _omit, ...withoutLast } = validUser;
    expect((await register(withoutLast)).status).toBe(400);
  });
});

describe("Auth · login", () => {
  it("cuenta verificada: 200 y cookie HttpOnly SameSite=Strict", async () => {
    const customer = await createCustomer();
    const res = await login(customer.email, customer.password);
    expect(res.status).toBe(200);
    const raw = String(res.headers["set-cookie"]);
    expect(raw).toContain("gira_session=");
    expect(raw).toContain("HttpOnly");
    expect(raw).toMatch(/SameSite=Strict/i);
  });

  it("cuenta sin verificar con la contraseña correcta: 403 y sin cookie", async () => {
    const customer = await createCustomer({ emailVerified: false });
    const res = await login(customer.email, customer.password);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/activa tu cuenta/i);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("cuenta sin verificar con la contraseña incorrecta: el 401 genérico (no revela que existe)", async () => {
    const customer = await createCustomer({ emailVerified: false });
    const wrong = await login(customer.email, "Incorrecta123");
    const nobody = await login("nadie@example.com", "Incorrecta123");
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe(nobody.body.message);
  });

  it("da el MISMO error para email inexistente y password incorrecto (anti-enumeración)", async () => {
    const customer = await createCustomer();
    const wrongPass = await login(customer.email, "Incorrecta123");
    const noUser = await login("nadie@example.com", "Incorrecta123");
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.message).toBe(noUser.body.message);
  });

  it("no exige la política: una contraseña corta falla con el mismo 401 genérico", async () => {
    const customer = await createCustomer();
    const res = await login(customer.email, "abc");
    expect(res.status).toBe(401);
  });

  it("con un correo inexistente también ejecuta bcrypt.compare (hash señuelo)", async () => {
    const compareSpy = vi.spyOn(bcrypt, "compare");
    const res = await login("nadie@example.com", "Incorrecta123");
    expect(res.status).toBe(401);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it("con un usuario inactivo también ejecuta bcrypt.compare y da el 401 genérico", async () => {
    const customer = await createCustomer();
    await User.updateOne({ email: customer.email }, { isActive: false });
    const compareSpy = vi.spyOn(bcrypt, "compare");
    const res = await login(customer.email, customer.password);
    expect(res.status).toBe(401);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Auth · rate limiting", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("bloquea el 6º intento de login dentro de la ventana con 429", async () => {
    const customer = await createCustomer();
    let last = 0;
    for (let i = 0; i < 6; i += 1) last = (await login(customer.email, "Incorrecta123")).status;
    expect(last).toBe(429);
  });
});

describe("Auth · me", () => {
  it("sin cookie /auth/me responde 401", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
  });

  it("con cookie válida /auth/me responde el usuario con nombre y apellido, sin password", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      email: customer.email,
      firstName: "Cliente",
      lastName: "Prueba",
      emailVerified: true,
    });
    expect(res.body.data.user).not.toHaveProperty("password");
    expect(res.body.data.user).not.toHaveProperty("name");
  });
});

describe("Auth · límite de body", () => {
  it("rechaza un body mayor a 10kb con 413", async () => {
    const res = await register({ ...validUser, firstName: "x".repeat(11 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe("Auth · body ausente o Content-Type inesperado (BACKEND_SECURITY_GUIDELINES §8)", () => {
  it("POST sin body responde 400, no 500", async () => {
    const res = await request(app).post("/api/v1/auth/register");
    expect(res.status).toBe(400);
  });

  it("POST con Content-Type de texto plano (body no parseado por express.json) responde 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "text/plain")
      .send("nombre=algo");
    expect(res.status).toBe(400);
  });
});
