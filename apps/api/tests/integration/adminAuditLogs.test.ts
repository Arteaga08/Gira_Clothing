import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction, AuditModule } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { createAdmin, createCustomer, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();

const AUDIT_URL = "/api/v1/admin/audit-logs";
const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const seedEntry = async (
  overrides: Partial<{
    action: AuditAction;
    module: AuditModule;
    targetId: string;
    actorId: mongoose.Types.ObjectId;
    actorType: "user" | "system";
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    ip: string;
    createdAt: Date;
  }> = {},
): Promise<string> => {
  const doc = await AuditLog.create({
    actorType: overrides.actorType ?? "system",
    action: overrides.action ?? AuditAction.ORDER_CREATED,
    module: overrides.module ?? AuditModule.ORDERS,
    targetId: overrides.targetId ?? "some-target",
    ...(overrides.actorId ? { actorId: overrides.actorId } : {}),
    ...(overrides.before ? { before: overrides.before } : {}),
    ...(overrides.after ? { after: overrides.after } : {}),
    ...(overrides.ip ? { ip: overrides.ip } : {}),
  });
  if (overrides.createdAt) {
    await AuditLog.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: overrides.createdAt } },
    );
  }
  return doc.id as string;
};

describe("GET /admin/audit-logs · autorización", () => {
  it("anónimo responde 401", async () => {
    expect((await request(app).get(AUDIT_URL)).status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const customerCookie = await loginAsCustomer(app);
    expect((await request(app).get(AUDIT_URL).set("Cookie", customerCookie)).status).toBe(403);
  });
});

describe("GET /admin/audit-logs · solo lectura", () => {
  it("no existe ninguna ruta mutante bajo /admin/audit-logs", async () => {
    const adminCookie = await loginAsAdmin(app);
    expect((await request(app).post(AUDIT_URL).set("Cookie", adminCookie)).status).toBe(404);
    expect(
      (await request(app).patch(`${AUDIT_URL}/x`).set("Cookie", adminCookie)).status,
    ).toBe(404);
    expect(
      (await request(app).delete(`${AUDIT_URL}/x`).set("Cookie", adminCookie)).status,
    ).toBe(404);
  });
});

describe("GET /admin/audit-logs · listado", () => {
  it("pagina correctamente y ordena por -createdAt por default", async () => {
    const adminCookie = await loginAsAdmin(app);
    // loginAsAdmin itself writes one LOGIN_SUCCESS entry, so 24 more make 25 total.
    for (let i = 0; i < 24; i += 1) {
      await seedEntry({ targetId: `order-${String(i)}` });
    }

    const res = await request(app)
      .get(`${AUDIT_URL}?limit=10&page=3`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(5);
    expect(res.body.meta.pages).toBe(3);
  });

  it("?module= filtra por módulo; un módulo inválido responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({ module: AuditModule.ORDERS });
    await seedEntry({ module: AuditModule.SHIPPING });

    const res = await request(app).get(`${AUDIT_URL}?module=shipping`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.logs[0].module).toBe("shipping");

    const bad = await request(app).get(`${AUDIT_URL}?module=wat`).set("Cookie", adminCookie);
    expect(bad.status).toBe(400);
  });

  it("?action= filtra por acción; una acción inválida responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({ action: AuditAction.ORDER_STATUS_CHANGED });
    await seedEntry({ action: AuditAction.ORDER_CREATED });

    const res = await request(app)
      .get(`${AUDIT_URL}?action=order_status_changed`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(1);

    const bad = await request(app).get(`${AUDIT_URL}?action=wat`).set("Cookie", adminCookie);
    expect(bad.status).toBe(400);
  });

  it("?actorId= filtra por actor; un id malformado responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const actorId = new mongoose.Types.ObjectId();
    await seedEntry({ actorId });
    await seedEntry({});

    const res = await request(app)
      .get(`${AUDIT_URL}?actorId=${actorId.toHexString()}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(1);

    const bad = await request(app).get(`${AUDIT_URL}?actorId=no-es-un-id`).set("Cookie", adminCookie);
    expect(bad.status).toBe(400);
  });

  it("?days= excluye entradas fuera de la ventana", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({ createdAt: daysAgo(3), targetId: "old-entry" });

    const res = await request(app).get(`${AUDIT_URL}?days=1`).set("Cookie", adminCookie);

    // loginAsAdmin itself writes a recent LOGIN_SUCCESS entry, so the window
    // is proven by the OLD entry's absence, not by an empty result.
    const targetIds = (res.body.data.logs as { targetId?: string }[]).map((log) => log.targetId);
    expect(targetIds).not.toContain("old-entry");
  });

  it("?search= encuentra por targetId", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({ targetId: "abc123publicid" });
    await seedEntry({ targetId: "other-target" });

    const res = await request(app).get(`${AUDIT_URL}?search=abc123publicid`).set("Cookie", adminCookie);

    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.logs[0].targetId).toBe("abc123publicid");
  });

  it("?limit=1000 responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const res = await request(app).get(`${AUDIT_URL}?limit=1000`).set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/audit-logs · sin PII", () => {
  it("no expone ip, actorId ni before/after crudos; da actor y cambios", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({
      action: AuditAction.ORDER_STATUS_CHANGED,
      actorType: "user",
      actorId: new mongoose.Types.ObjectId(),
      before: { status: "paid" },
      after: { status: "processing" },
      ip: "203.0.113.9",
      targetId: "dto-shape",
    });

    const res = await request(app).get(`${AUDIT_URL}?search=dto-shape`).set("Cookie", adminCookie);
    const log = res.body.data.logs[0] as Record<string, unknown>;

    expect(Object.keys(log).sort()).toEqual(
      ["action", "actor", "changes", "createdAt", "id", "module", "targetId"].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain("203.0.113.9");
  });

  it("los cambios solo traen campos de la lista blanca y omiten los que no cambiaron", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({
      action: AuditAction.ORDER_STATUS_CHANGED,
      before: { status: "paid", priority: "normal" },
      after: { status: "processing", priority: "normal", email: "ana@example.com", name: "Ana" },
      targetId: "whitelist",
    });

    const res = await request(app).get(`${AUDIT_URL}?search=whitelist`).set("Cookie", adminCookie);

    expect(res.body.data.logs[0].changes).toEqual([
      { field: "status", before: "paid", after: "processing" },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("ana@example.com");
  });

  it("el origen de envío sale como «modificado» sin valores y el paquete se aplana", async () => {
    const adminCookie = await loginAsAdmin(app);
    const origin = (phone: string) => ({
      name: "Gira",
      phone,
      email: "dueno@example.com",
      line1: "Calle 1",
      district: "Centro",
      city: "CDMX",
      state: "CX",
      postalCode: "01000",
    });
    await seedEntry({
      action: AuditAction.SETTINGS_SHIPPING_UPDATED,
      module: AuditModule.SETTINGS,
      before: { origin: origin("5511111111"), parcel: { tareGrams: 150, boxLengthCm: 30 }, quoteTtlMinutes: 30 },
      after: { origin: origin("5522222222"), parcel: { tareGrams: 200, boxLengthCm: 30 }, quoteTtlMinutes: 30 },
      targetId: "shipping-entry",
    });

    const res = await request(app).get(`${AUDIT_URL}?search=shipping-entry`).set("Cookie", adminCookie);

    expect(res.body.data.logs[0].changes).toEqual([
      { field: "origin", redacted: true },
      { field: "parcel.tareGrams", before: 150, after: 200 },
    ]);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("5522222222");
    expect(body).not.toContain("dueno@example.com");
  });

  it("un origen que no cambió no aparece", async () => {
    const adminCookie = await loginAsAdmin(app);
    const origin = { name: "Gira", phone: "5511111111", line1: "Calle 1", district: "C", city: "X", state: "CX", postalCode: "01000" };
    await seedEntry({
      action: AuditAction.SETTINGS_SHIPPING_UPDATED,
      module: AuditModule.SETTINGS,
      before: { origin, freeShippingThreshold: null },
      after: { origin, freeShippingThreshold: 150000 },
      targetId: "same-origin",
    });

    const res = await request(app).get(`${AUDIT_URL}?search=same-origin`).set("Cookie", adminCookie);

    expect(res.body.data.logs[0].changes).toEqual([
      { field: "freeShippingThreshold", before: null, after: 150000 },
    ]);
  });

  it("el motivo solo se muestra en movimientos de stock", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedEntry({
      action: AuditAction.STOCK_ADJUSTED,
      module: AuditModule.INVENTORY,
      before: { onHand: 3 },
      after: { onHand: 5, reason: "Conteo físico" },
      targetId: "stock-entry",
    });
    await seedEntry({
      action: AuditAction.LABEL_FAILED,
      module: AuditModule.SHIPPING,
      after: { reason: "Calle 1, Ana Pérez" },
      targetId: "label-entry",
    });

    const stock = await request(app).get(`${AUDIT_URL}?search=stock-entry`).set("Cookie", adminCookie);
    const label = await request(app).get(`${AUDIT_URL}?search=label-entry`).set("Cookie", adminCookie);

    expect(stock.body.data.logs[0].changes).toEqual([
      { field: "onHand", before: 3, after: 5 },
      { field: "reason", after: "Conteo físico" },
    ]);
    expect(label.body.data.logs[0].changes).toEqual([]);
  });
});

describe("GET /admin/audit-logs · actor", () => {
  const seedActors = async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    await seedEntry({ actorType: "user", actorId: new mongoose.Types.ObjectId(admin.id), targetId: "by-admin" });
    await seedEntry({ actorType: "user", actorId: new mongoose.Types.ObjectId(customer.id), targetId: "by-customer" });
    await seedEntry({ actorType: "system", targetId: "by-system" });
    await seedEntry({ actorType: "user", targetId: "by-unknown" });
  };

  const targetsFor = async (cookie: string, actor?: string): Promise<Record<string, string>> => {
    const res = await request(app)
      .get(`${AUDIT_URL}?search=by-${actor ? `&actor=${actor}` : ""}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    return Object.fromEntries(
      (res.body.data.logs as { targetId: string; actor: string }[]).map((l) => [l.targetId, l.actor]),
    );
  };

  it("resuelve el actor por rol sin exponer su id", async () => {
    const cookie = await loginAsAdmin(app);
    await seedActors();

    expect(await targetsFor(cookie)).toEqual({
      "by-admin": "admin",
      "by-customer": "customer",
      "by-system": "system",
      "by-unknown": "unknown",
    });
  });

  it("?actor=team deja solo administradores y sistema", async () => {
    const cookie = await loginAsAdmin(app);
    await seedActors();
    expect(Object.keys(await targetsFor(cookie, "team")).sort()).toEqual(["by-admin", "by-system"]);
  });

  it("?actor=admin, system y customer separan (customer incluye desconocidos)", async () => {
    const cookie = await loginAsAdmin(app);
    await seedActors();
    expect(Object.keys(await targetsFor(cookie, "admin"))).toEqual(["by-admin"]);
    expect(Object.keys(await targetsFor(cookie, "system"))).toEqual(["by-system"]);
    expect(Object.keys(await targetsFor(cookie, "customer")).sort()).toEqual(["by-customer", "by-unknown"]);
    expect(Object.keys(await targetsFor(cookie, "all"))).toHaveLength(4);
  });

  it("?actor= inválido responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${AUDIT_URL}?actor=wat`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/audit-logs/:id", () => {
  it("devuelve el registro con el mismo DTO", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedEntry({
      action: AuditAction.ORDER_PRIORITY_UPDATED,
      before: { priority: "normal" },
      after: { priority: "high" },
      ip: "198.51.100.7",
      targetId: "one-entry",
    });

    const res = await request(app).get(`${AUDIT_URL}/${id}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.log).toMatchObject({
      id,
      actor: "system",
      action: "order_priority_updated",
      targetId: "one-entry",
      changes: [{ field: "priority", before: "normal", after: "high" }],
    });
    expect(JSON.stringify(res.body)).not.toContain("198.51.100.7");
  });

  it("id malformado responde 400 e inexistente 404", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await request(app).get(`${AUDIT_URL}/no-es-id`).set("Cookie", cookie)).status).toBe(400);
    const missing = new mongoose.Types.ObjectId().toHexString();
    expect((await request(app).get(`${AUDIT_URL}/${missing}`).set("Cookie", cookie)).status).toBe(404);
  });

  it("cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    const missing = new mongoose.Types.ObjectId().toHexString();
    expect((await request(app).get(`${AUDIT_URL}/${missing}`).set("Cookie", cookie)).status).toBe(403);
  });
});
