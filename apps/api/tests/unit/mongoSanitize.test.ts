import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { mongoSanitize } from "../../src/middlewares/mongoSanitize.js";

const run = (req: Partial<Request>): void => {
  const next = vi.fn() as unknown as NextFunction;
  mongoSanitize(req as Request, {} as Response, next);
};

describe("mongoSanitize", () => {
  it("elimina claves con operadores $ anidadas en el body", () => {
    const req = { body: { email: { $gt: "" }, name: "ok" } } as Partial<Request>;
    run(req);
    // The operator key is stripped; the emptied object is harmless against a
    // typed Mongoose schema ({} never casts to a String field).
    expect(req.body).toEqual({ email: {}, name: "ok" });
  });

  it("elimina claves que contienen un punto", () => {
    const req = { body: { "a.b": 1, clean: 2 } } as Partial<Request>;
    run(req);
    expect(req.body).toEqual({ clean: 2 });
  });

  it("bloquea prototype pollution (__proto__, constructor, prototype)", () => {
    const req = {
      body: JSON.parse('{"__proto__": {"admin": true}, "constructor": 1, "prototype": 2, "ok": 3}'),
    } as Partial<Request>;
    run(req);
    expect(req.body).toEqual({ ok: 3 });
  });

  it("limpia arrays de objetos recursivamente", () => {
    const req = { body: { items: [{ $ne: 1, keep: 2 }] } } as Partial<Request>;
    run(req);
    expect(req.body).toEqual({ items: [{ keep: 2 }] });
  });

  it("muta req.query EN SITIO sin reasignarlo (Express 5: query es read-only)", () => {
    const query = { $where: "1", page: "2" };
    const req = { query } as unknown as Partial<Request>;
    run(req);
    // Same object reference, mutated in place.
    expect(req.query).toBe(query);
    expect(req.query).toEqual({ page: "2" });
  });
});
