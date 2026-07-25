import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";

const app = buildApp();

describe("GET /api/v1/health", () => {
  it("responde 200 con estado success y sin datos sensibles", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("uptime");
    expect(res.body.data).toHaveProperty("db");
  });

  it("responde 404 con envelope para una ruta inexistente", async () => {
    const res = await request(app).get("/api/v1/no-existe");
    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });
});
