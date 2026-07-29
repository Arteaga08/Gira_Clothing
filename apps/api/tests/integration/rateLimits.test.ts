import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";

describe("rate limiters públicos", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("limita el catálogo público con su propio techo (500/15min)", async () => {
    const res = await request(app).get("/api/v1/catalog/products");
    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(Number(res.headers["ratelimit-limit"])).toBe(500);
  });

  it("aplica un límite propio y más estricto al seguimiento público (60/15min)", async () => {
    const res = await request(app).get(`/api/v1/orders/${"A".repeat(43)}/tracking`);
    expect(Number(res.headers["ratelimit-limit"])).toBe(60);
  });

  it("no agrega un limiter propio a las rutas admin: solo ven el backstop global (1000/15min)", async () => {
    const res = await request(app).get("/api/v1/admin/orders");
    expect(Number(res.headers["ratelimit-limit"])).toBe(1000);
  });
});
