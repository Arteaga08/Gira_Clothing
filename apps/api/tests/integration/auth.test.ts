import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";

const app = buildApp();

const validUser = {
  name: "Ana López",
  email: "ana@example.com",
  password: "Segura123",
};

// Extracts the session cookie string from a login/register response.
const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw.join(";") : String(raw ?? "");
};

describe("Auth · registro", () => {
  it("crea un usuario y responde 201 sin devolver el password", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("ana@example.com");
    expect(res.body.data.user).not.toHaveProperty("password");
    expect(res.body.data.user.role).toBe("customer");
  });

  it("rechaza email duplicado con 409", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const res = await request(app).post("/api/v1/auth/register").send(validUser);
    expect(res.status).toBe(409);
  });

  it("ignora un intento de mass assignment de role=admin", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("customer");
  });

  it("rechaza password débil con 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, password: "weak" });
    expect(res.status).toBe(400);
  });
});

describe("Auth · login", () => {
  beforeEach(async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
  });

  it("con credenciales correctas responde 200 y setea cookie HttpOnly SameSite=Strict", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    expect(cookie).toContain("gira_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("da el MISMO error para email inexistente y password incorrecto (anti-enumeración)", async () => {
    const wrongPass = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: "Incorrecta123" });
    const noUser = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nadie@example.com", password: "Incorrecta123" });

    expect(wrongPass.status).toBe(noUser.status);
    expect(wrongPass.status).toBe(401);
    expect(wrongPass.body.message).toBe(noUser.body.message);
  });
});

describe("Auth · rate limiting", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("bloquea el 6º intento de login dentro de la ventana con 429 (en producción)", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    process.env.NODE_ENV = "production";

    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", "http://localhost:3000")
        .send({ email: validUser.email, password: "Incorrecta123" });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("Auth · me + logout", () => {
  const loginCookie = async (): Promise<string> => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    return cookieFrom(res);
  };

  it("sin cookie /auth/me responde 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("con cookie válida /auth/me responde 200 con el usuario y sin password", async () => {
    const cookie = await loginCookie();
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("logout sobrescribe la cookie y /auth/me pasa a 401", async () => {
    const cookie = await loginCookie();
    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000");
    expect(out.status).toBe(200);

    const cleared = cookieFrom(out);
    const after = await request(app).get("/api/v1/auth/me").set("Cookie", cleared);
    expect(after.status).toBe(401);
  });
});

describe("Auth · límite de body", () => {
  it("rechaza un body mayor a 10kb con 413", async () => {
    const huge = "x".repeat(11 * 1024);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, name: huge });
    expect(res.status).toBe(413);
  });
});
