import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import { loginAsAdmin, createCustomer } from "../helpers/auth.js";

const ORIGIN = "http://localhost:3000";

describe("rate limiters públicos", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("limita el catálogo público con su propio techo (500/15min)", async () => {
    const res = await request(app).get("/api/v1/catalog/products");
    expect(Number(res.headers["ratelimit-limit"])).toBe(500);
  });

  it("aplica un límite propio y más estricto al seguimiento público (60/15min)", async () => {
    const res = await request(app).get(`/api/v1/orders/${"A".repeat(43)}/tracking`);
    expect(Number(res.headers["ratelimit-limit"])).toBe(60);
  });

  it("las rutas admin no pasan por ningún limiter (ni siquiera el global)", async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    const cookie = await loginAsAdmin(app);
    process.env.RATE_LIMIT_ENABLED = "true";
    const res = await request(app).get("/api/v1/admin/orders").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty("ratelimit-limit");
  });

  it("el webhook de Stripe tiene su propio limiter", async () => {
    const res = await request(app).post("/api/webhooks/stripe").send("{}");
    expect(Number(res.headers["ratelimit-limit"])).toBe(1000);
  });

  it("el webhook de Envía tiene su propio limiter", async () => {
    const res = await request(app).post("/api/webhooks/envia").send("{}");
    expect(Number(res.headers["ratelimit-limit"])).toBe(1000);
  });

  it("con RATE_LIMIT_ENABLED=false no se aplica ningún límite", async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    const res = await request(app).get("/api/v1/catalog/products");
    expect(res.headers).not.toHaveProperty("ratelimit-limit");
  });
});

describe("login: correo + IP", () => {
  const app = buildApp();
  const attempt = (email: string, password = "Incorrecta123") =>
    request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email, password });

  beforeEach(async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    await createCustomer({ email: "ana@example.com", password: "Segura1234" });
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("5 fallos con el mismo correo bloquean el sexto, pero otro correo desde la misma IP sigue pasando", async () => {
    for (let i = 0; i < 5; i += 1) expect((await attempt("ana@example.com")).status).toBe(401);
    expect((await attempt("ana@example.com")).status).toBe(429);
    expect((await attempt("otra@example.com")).status).toBe(401);
  });

  it("el correo se normaliza: mayúsculas no sirven para saltarse el límite", async () => {
    for (let i = 0; i < 5; i += 1) await attempt("ana@example.com");
    expect((await attempt("ANA@Example.com")).status).toBe(429);
  });

  it("un login exitoso no cuenta contra el límite", async () => {
    for (let i = 0; i < 8; i += 1) {
      expect((await attempt("ana@example.com", "Segura1234")).status).toBe(200);
    }
  });

  it("el techo por IP frena el password spraying contra muchos correos distintos", async () => {
    for (let i = 0; i < 30; i += 1) await attempt(`victima${i}@example.com`);
    expect((await attempt("victima99@example.com")).status).toBe(429);
  });
});

describe("acciones de cuenta: límite por correo (3/15 min) además de IP", () => {
  const app = buildApp();
  const signup = (email: string) =>
    request(app)
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({ firstName: "Ana", lastName: "López", email, password: "Segura1234" });
  const emailOnly = (path: string, email: string) =>
    request(app).post(`/api/v1/auth/${path}`).set("Origin", ORIGIN).send({ email });

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("registro: el 4º intento con el mismo correo da 429; otro correo pasa", async () => {
    for (let i = 0; i < 3; i += 1) expect((await signup("ana@example.com")).status).toBe(201);
    expect((await signup("ana@example.com")).status).toBe(429);
    expect((await signup("otra@example.com")).status).toBe(201);
  });

  it.each(["resend-verification", "forgot-password"])(
    "%s: el 4º intento con el mismo correo da 429, también con mayúsculas",
    async (path) => {
      for (let i = 0; i < 3; i += 1)
        expect((await emailOnly(path, "ana@example.com")).status).toBe(200);
      expect((await emailOnly(path, "ANA@Example.com")).status).toBe(429);
      expect((await emailOnly(path, "otra@example.com")).status).toBe(200);
    },
  );

  it("el límite por IP (20/15 min) es uno solo para todas las acciones de cuenta", async () => {
    const token = "a".repeat(64);
    for (let i = 0; i < 20; i += 1) {
      const path = ["verify-email", "reset-password"][i % 2]!;
      const body =
        path === "verify-email" ? { token, password: "x" } : { token, password: "Segura1234" };
      await request(app).post(`/api/v1/auth/${path}`).set("Origin", ORIGIN).send(body);
    }
    expect((await emailOnly("forgot-password", "nueva@example.com")).status).toBe(429);
    expect((await signup("nueva2@example.com")).status).toBe(429);
  });
});
