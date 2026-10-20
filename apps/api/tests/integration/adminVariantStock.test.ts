import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";
import { AuditLog } from "../../src/models/AuditLog.js";

const app = buildApp();
const BASE = "/api/v1/admin/variants";

const patchStock = (cookie: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/${id}/stock`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);
const activity = (cookie: string, id: string) =>
  request(app).get(`${BASE}/${id}/activity`).set("Cookie", cookie);

describe("PATCH /admin/variants/:id/stock · motivo y respuesta AdminVariant", () => {
  it("recuento con motivo responde AdminVariant y guarda el motivo en el audit", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "R1", onHand: 3 });
    const res = await patchStock(cookie, v.id, { onHand: 12, reason: "  Recuento de bodega  " });
    expect(res.status).toBe(200);
    expect(res.body.data.variant).toMatchObject({
      id: v.id,
      onHand: 12,
      available: 12,
      product: { name: "Modelo R1", category: { name: "Categoría R1" } },
    });
    const entry = await AuditLog.findOne({ action: "stock_set", targetId: v.id }).lean();
    expect(entry?.before).toMatchObject({ onHand: 3 });
    expect(entry?.after).toMatchObject({ onHand: 12, reason: "Recuento de bodega" });
  });

  it("movimiento sin motivo funciona y no guarda reason", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "R2", onHand: 10 });
    const res = await patchStock(cookie, v.id, { delta: -4 });
    expect(res.status).toBe(200);
    expect(res.body.data.variant.onHand).toBe(6);
    const entry = await AuditLog.findOne({ action: "stock_adjusted", targetId: v.id }).lean();
    expect(entry?.after).toEqual({ onHand: 6 });
  });

  it("motivo de más de 200 caracteres responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "R3", onHand: 1 });
    const res = await patchStock(cookie, v.id, { delta: 1, reason: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("409 no deja audit ni cambia el stock", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "R4", onHand: 2, reserved: 2 });
    const res = await patchStock(cookie, v.id, { delta: -1, reason: "merma" });
    expect(res.status).toBe(409);
    expect(await AuditLog.countDocuments({ targetId: v.id })).toBe(0);
  });

  it("variante inexistente responde 404 en recuento y en movimiento", async () => {
    const cookie = await loginAsAdmin(app);
    const ghost = "64b7f3f3f3f3f3f3f3f3f3f3";
    expect((await patchStock(cookie, ghost, { onHand: 1 })).status).toBe(404);
    expect((await patchStock(cookie, ghost, { delta: 1 })).status).toBe(404);
  });
});

describe("GET /admin/variants/:id/activity", () => {
  it("lista los movimientos recientes con actor, before/after, delta y motivo", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "A1", onHand: 5 });
    await patchStock(cookie, v.id, { onHand: 10, reason: "Conteo" });
    await patchStock(cookie, v.id, { delta: -3 });
    const res = await activity(cookie, v.id);
    expect(res.status).toBe(200);
    const rows = res.body.data.activity;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ action: "stock_adjusted", before: 10, after: 7, delta: -3 });
    expect(rows[1]).toMatchObject({ action: "stock_set", before: 5, after: 10, delta: 5, reason: "Conteo" });
    expect(rows[0].actorName).toMatch(/Admin Gira/);
    expect(rows[0]).not.toHaveProperty("ip");
    expect(rows[0]).not.toHaveProperty("actorId");
  });

  it("limita a 20 y no mezcla otras variantes", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "A2", onHand: 100 });
    const other = await seedVariant({ tag: "A3", onHand: 100 });
    for (let i = 0; i < 22; i += 1) await patchStock(cookie, v.id, { delta: 1 });
    await patchStock(cookie, other.id, { delta: 1 });
    expect((await activity(cookie, v.id)).body.data.activity).toHaveLength(20);
    expect((await activity(cookie, other.id)).body.data.activity).toHaveLength(1);
  });

  it("id malformado 400, inexistente 404, anónimo 401, cliente 403", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await activity(cookie, "no-es-id")).status).toBe(400);
    expect((await activity(cookie, "64b7f3f3f3f3f3f3f3f3f3f3")).status).toBe(404);
    expect((await request(app).get(`${BASE}/64b7f3f3f3f3f3f3f3f3f3f3/activity`)).status).toBe(401);
    const customer = await loginAsCustomer(app);
    expect((await activity(customer, "64b7f3f3f3f3f3f3f3f3f3f3")).status).toBe(403);
  });
});
