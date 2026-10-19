import { describe, it, expect } from "vitest";
import request from "supertest";
import { AuditAction, OrderPriority, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const patchPriority = (cookie: string, id: unknown, body: Record<string, unknown>) =>
  request(app)
    .patch(`${BASE}/${String(id)}/priority`)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send(body);

describe("PATCH /admin/orders/:id/priority", () => {
  it("cambia la prioridad, audita y no toca el status ni su historial", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    const before = await Order.findById(id).lean();

    const res = await patchPriority(cookie, id, { priority: "urgente" });

    expect(res.status).toBe(200);
    expect(res.body.data.order.priority).toBe(OrderPriority.URGENT);
    const after = await Order.findById(id).lean();
    expect(after?.status).toBe(OrderStatus.PAID);
    expect(after?.statusHistory).toHaveLength(before!.statusHistory.length);
    const logs = await AuditLog.find({
      action: AuditAction.ORDER_PRIORITY_UPDATED,
      targetId: String(id),
    }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.before).toEqual({ priority: "normal" });
    expect(logs[0]?.after).toEqual({ priority: "urgente" });
  });

  it("funciona en cualquier estado, incluso cerrado (nunca condiciona una transición)", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.CANCELLED, total: 1000, createdAt: new Date() });

    expect((await patchPriority(cookie, id, { priority: "alta" })).status).toBe(200);
  });

  it("rechaza valores fuera del enum o ausentes con 400", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    expect((await patchPriority(cookie, id, { priority: "critica" })).status).toBe(400);
    expect((await patchPriority(cookie, id, {})).status).toBe(400);
    expect((await Order.findById(id).lean())?.priority).toBe("normal");
  });

  it("404 si la orden no existe", async () => {
    const cookie = await loginAsAdmin(app);

    expect((await patchPriority(cookie, "507f1f77bcf86cd799439011", { priority: "alta" })).status).toBe(404);
  });

  it("exige admin: 401 anónimo y 403 cliente", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    const anonymous = await request(app)
      .patch(`${BASE}/${String(id)}/priority`)
      .set("Origin", ORIGIN)
      .send({ priority: "alta" });
    expect(anonymous.status).toBe(401);
    expect((await patchPriority(await loginAsCustomer(app), id, { priority: "alta" })).status).toBe(403);
  });
});
