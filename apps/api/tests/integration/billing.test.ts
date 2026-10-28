import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { ORIGIN, createCustomer, loginCustomer, loginAsAdmin } from "../helpers/auth.js";

const app = buildApp();

const BILLING = {
  rfc: "LOMM910312AB1",
  legalName: "María López Martínez",
  fiscalRegime: "612",
  cfdiUse: "G03",
  postalCode: "06000",
};

const put = (cookie: string | undefined, body: Record<string, unknown>) => {
  const req = request(app).put("/api/v1/account/billing").set("Origin", ORIGIN);
  return (cookie ? req.set("Cookie", cookie) : req).send(body);
};
const del = (cookie: string) =>
  request(app).delete("/api/v1/account/billing").set("Origin", ORIGIN).set("Cookie", cookie);
const getAccount = (cookie: string) => request(app).get("/api/v1/account").set("Cookie", cookie);

const setup = async () => loginCustomer(app, await createCustomer());

describe("/account/billing", () => {
  it("sin sesión 401 y un admin 403", async () => {
    expect((await put(undefined, BILLING)).status).toBe(401);
    expect((await put(await loginAsAdmin(app), BILLING)).status).toBe(403);
  });

  it("guarda, aparece en GET /account, reemplaza y se borra", async () => {
    const cookie = await setup();
    expect((await getAccount(cookie)).body.data.billing).toBeNull();

    const saved = await put(cookie, BILLING);
    expect(saved.status).toBe(200);
    expect(saved.body.data.billing).toEqual(BILLING);
    expect((await getAccount(cookie)).body.data.billing).toEqual(BILLING);

    const replaced = await put(cookie, { ...BILLING, legalName: "Otra Razón SA", cfdiUse: "S01" });
    expect(replaced.body.data.billing).toMatchObject({ legalName: "Otra Razón SA", cfdiUse: "S01" });

    const removed = await del(cookie);
    expect(removed.status).toBe(200);
    expect(removed.body.data.billing).toBeNull();
    expect((await getAccount(cookie)).body.data.billing).toBeNull();
  });

  it("normaliza el RFC (mayúsculas) y deja pasar & y Ñ sin escapar", async () => {
    const cookie = await setup();
    const res = await put(cookie, { ...BILLING, rfc: " ñab910312ab1 ", legalName: "Pérez & Hijos Ñandú SA" });
    expect(res.status).toBe(200);
    expect(res.body.data.billing.rfc).toBe("ÑAB910312AB1");
    expect(res.body.data.billing.legalName).toBe("Pérez & Hijos Ñandú SA");
  });

  it("acepta un RFC con & (persona moral)", async () => {
    const cookie = await setup();
    expect((await put(cookie, { ...BILLING, rfc: "A&A910312AB1" })).status).toBe(200);
  });

  it("rechaza RFC, régimen, uso de CFDI y código postal inválidos y marcado en la razón social", async () => {
    const cookie = await setup();
    for (const bad of [
      { rfc: "123" },
      { rfc: "LOMM9103AB1" },
      { fiscalRegime: "999" },
      { cfdiUse: "ZZ9" },
      { postalCode: "6000" },
      { legalName: "" },
      { legalName: "Empresa <script>" },
      { legalName: "x".repeat(301) },
    ]) {
      expect((await put(cookie, { ...BILLING, ...bad })).status, JSON.stringify(bad)).toBe(400);
    }
    for (const key of Object.keys(BILLING)) {
      const { [key as keyof typeof BILLING]: _omit, ...rest } = BILLING;
      expect((await put(cookie, rest)).status, `sin ${key}`).toBe(400);
    }
  });

  it("ignora campos desconocidos", async () => {
    const cookie = await setup();
    const res = await put(cookie, { ...BILLING, role: "admin", extra: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.billing).toEqual(BILLING);
  });
});
