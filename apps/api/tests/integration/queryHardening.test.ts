import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import Joi from "joi";
import { materializeQuery } from "../../src/middlewares/materializeQuery.js";
import { mongoSanitize } from "../../src/middlewares/mongoSanitize.js";
import { sanitizeInput } from "../../src/middlewares/sanitizeInput.js";
import { validate } from "../../src/middlewares/validate.js";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin } from "../helpers/auth.js";

const schema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string(),
});

/** Real Express 5 with the same query chain app.ts uses. */
const chainApp = () => {
  const app = express();
  app.use(materializeQuery);
  app.use(mongoSanitize);
  app.use(sanitizeInput);
  app.get("/raw", (req, res) => res.json({ query: req.query }));
  app.get("/validated", validate(schema, "query"), (req, res) => res.json({ query: req.query }));
  return app;
};

describe("req.query en Express 5", () => {
  it("mongoSanitize elimina operadores y claves con punto que llegan por la query", async () => {
    const res = await request(chainApp()).get("/raw?$where=1&b.c=2&ok=1&constructor=x");
    expect(res.body.query).toEqual({ ok: "1" });
  });

  it("sanitizeInput escapa el HTML de la query", async () => {
    const res = await request(chainApp()).get("/raw?q=%3Cscript%3Ealert(1)%3C/script%3E");
    expect(res.body.query.q).not.toContain("<script>");
  });

  it("validate entrega al handler el valor convertido, con defaults y sin claves desconocidas", async () => {
    const res = await request(chainApp()).get("/validated?limit=5&extra=1&search=gorra");
    expect(res.body.query).toEqual({ page: 1, limit: 5, search: "gorra" });
  });

  it("validate rechaza una query inválida", async () => {
    const res = await request(chainApp()).get("/validated?limit=9999");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("en la app real, un endpoint recibe la query ya validada (granularity por defecto)", async () => {
    const app = buildApp();
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .get("/api/v1/admin/stats/timeseries?days=7&basura=1")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.granularity).toBe("day");
  });
});
