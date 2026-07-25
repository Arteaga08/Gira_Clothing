import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { sanitizeInput } from "../../src/middlewares/sanitizeInput.js";

const run = (req: Partial<Request>): void => {
  const next = vi.fn() as unknown as NextFunction;
  sanitizeInput(req as Request, {} as Response, next);
};

describe("sanitizeInput", () => {
  it("escapa <script> en strings del body", () => {
    const req = { body: { bio: "<script>alert(1)</script>hola" } } as Partial<Request>;
    run(req);
    expect(req.body.bio).not.toContain("<script>");
    expect(req.body.bio).toContain("hola");
  });

  it("sanitiza recursivamente objetos y arrays anidados", () => {
    const req = {
      body: { nested: { list: ["<img src=x onerror=alert(1)>", "clean"] } },
    } as Partial<Request>;
    run(req);
    expect(req.body.nested.list[0]).not.toContain("onerror=");
    expect(req.body.nested.list[1]).toBe("clean");
  });

  it("NO altera campos de credencial (password, token, code, secret)", () => {
    const raw = "<b>P@ss>word</b>";
    const req = {
      body: { password: raw, token: raw, code: raw, secret: raw, name: raw },
    } as Partial<Request>;
    run(req);
    expect(req.body.password).toBe(raw);
    expect(req.body.token).toBe(raw);
    expect(req.body.code).toBe(raw);
    expect(req.body.secret).toBe(raw);
    // Non-credential field IS sanitized.
    expect(req.body.name).not.toBe(raw);
  });
});
