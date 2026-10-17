import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { createLogger } from "../../src/config/logger.js";

const PUBLIC_ID = "A".repeat(43);

/** Builds the real app with a logger that writes to memory, so the test sees exactly what would hit stdout. */
const appWithCapturedLogs = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const app = buildApp({ logger: createLogger(stream, "info") });
  return { app, output: () => lines.join("") };
};

describe("logs sin secretos", () => {
  it("el login no deja el JWT ni set-cookie en los logs", async () => {
    const { app, output } = appWithCapturedLogs();
    await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Ana", email: "ana@example.com", password: "Segura123" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: "Segura123" });

    const rawCookie = String(res.headers["set-cookie"]);
    const jwt = /gira_session=([^;]+)/.exec(rawCookie)?.[1];
    expect(jwt).toBeTruthy();

    const logs = output();
    expect(logs).toContain("set-cookie");
    expect(logs).not.toContain(jwt!);
  });

  it.each([
    ["detalle", `/api/v1/orders/${PUBLIC_ID}`],
    ["seguimiento", `/api/v1/orders/${PUBLIC_ID}/tracking`],
  ])("la consulta pública (%s) no deja el publicId en ninguna parte del log", async (_n, url) => {
    const { app, output } = appWithCapturedLogs();
    await request(app).get(url);
    const logs = output();
    expect(logs).toContain("/api/v1/orders/");
    expect(logs).not.toContain(PUBLIC_ID);
  });

  it("deja intactas las rutas que no llevan publicId", async () => {
    const { app, output } = appWithCapturedLogs();
    await request(app).get("/api/v1/orders/mine");
    expect(output()).toContain("/api/v1/orders/mine");
  });
});
