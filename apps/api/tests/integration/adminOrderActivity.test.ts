import { describe, it, expect } from "vitest";
import request from "supertest";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const activityOf = (cookie: string, id: unknown) =>
  request(app).get(`${BASE}/${String(id)}/activity`).set("Cookie", cookie);

describe("GET /admin/orders/:id/activity", () => {
  it("lista las acciones de la orden, más reciente primero, sin before/after ni ip", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "ACT1"));
    await request(app)
      .patch(`${BASE}/${String(order._id)}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "cancelled", reason: "Prueba de actividad" });

    const res = await activityOf(adminCookie, order._id);

    expect(res.status).toBe(200);
    const activity = res.body.data.activity as {
      action: string;
      createdAt: string;
      actorType: string;
    }[];
    expect(activity.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        AuditAction.ORDER_STATUS_CHANGED,
        AuditAction.ORDER_CREATED,
        AuditAction.PAYMENT_INTENT_CREATED,
      ]),
    );
    for (const entry of activity) {
      expect(entry).not.toHaveProperty("before");
      expect(entry).not.toHaveProperty("after");
      expect(entry).not.toHaveProperty("ip");
      expect(entry).not.toHaveProperty("targetId");
    }
    const dates = activity.map((a) => a.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const changed = activity.find((a) => a.action === AuditAction.ORDER_STATUS_CHANGED);
    expect(changed?.actorType).toBe("user");
  });

  it("no mezcla la actividad de otra orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const a = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "ACT2A"));
    const b = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "ACT2B"));
    await request(app)
      .patch(`${BASE}/${String(b._id)}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "cancelled", reason: "Solo la orden B" });

    const res = await activityOf(adminCookie, a._id);

    const actions = (res.body.data.activity as { action: string }[]).map((x) => x.action);
    expect(actions).not.toContain(AuditAction.ORDER_STATUS_CHANGED);
  });

  it("404 si la orden no existe y 400 si el id no es válido", async () => {
    const adminCookie = await loginAsAdmin(app);

    expect((await activityOf(adminCookie, "507f1f77bcf86cd799439011")).status).toBe(404);
    expect((await activityOf(adminCookie, "no-es-un-id")).status).toBe(400);
  });

  it("exige admin: 401 anónimo y 403 cliente", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "ACT3"));

    expect((await request(app).get(`${BASE}/${String(order._id)}/activity`)).status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    expect((await activityOf(customerCookie, order._id)).status).toBe(403);
  });
});
