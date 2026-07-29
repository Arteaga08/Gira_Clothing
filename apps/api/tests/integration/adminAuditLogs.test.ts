import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction, AuditModule } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();

const AUDIT_URL = "/api/v1/admin/audit-logs";
const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const seedEntry = async (
  overrides: Partial<{
    action: AuditAction;
    module: AuditModule;
    targetId: string;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
  }> = {},
): Promise<void> => {
  const doc = await AuditLog.create({
    actorType: "system",
    action: overrides.action ?? AuditAction.ORDER_CREATED,
    module: overrides.module ?? AuditModule.ORDERS,
    targetId: overrides.targetId ?? "some-target",
    ...(overrides.actorId ? { actorId: overrides.actorId } : {}),
  });
  if (overrides.createdAt) {
    await AuditLog.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: overrides.createdAt } },
    );
  }
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
