import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { AuditAction, NotificationType, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Notification } from "../../src/models/Notification.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const bulk = (cookie: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/bulk-status`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const seed = (status: OrderStatus) => seedOrder({ status, total: 1000, createdAt: new Date() });

interface Result {
  id: string;
  orderNumber: string;
  outcome: string;
  message?: string;
}

describe("PATCH /admin/orders/bulk-status", () => {
  it("mueve las pagadas a processing, deja las que ya lo estaban y rechaza el resto", async () => {
    const cookie = await loginAsAdmin(app);
    const paid = await seed(OrderStatus.PAID);
    const already = await seed(OrderStatus.PROCESSING);
    const pending = await seed(OrderStatus.PENDING_PAYMENT);

    const res = await bulk(cookie, {
      ids: [String(paid), String(already), String(pending)],
      status: "processing",
    });

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      (res.body.data.result.results as Result[]).map((r) => [r.id, r]),
    );
    expect(byId[String(paid)]?.outcome).toBe("updated");
    expect(byId[String(already)]?.outcome).toBe("unchanged");
    expect(byId[String(pending)]?.outcome).toBe("rejected");
    expect(byId[String(pending)]?.message).toBeTruthy();
    expect(byId[String(paid)]?.orderNumber).toMatch(/^GC-/);
    expect(res.body.data.result.summary).toEqual({ updated: 1, unchanged: 1, rejected: 1 });
    expect((await Order.findById(paid).lean())?.status).toBe(OrderStatus.PROCESSING);
    expect((await Order.findById(pending).lean())?.status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it("deja UNA entrada de auditoría y UN correo por orden movida (nunca por lote)", async () => {
    const cookie = await loginAsAdmin(app);
    const a = await seed(OrderStatus.PAID);
    const b = await seed(OrderStatus.PAID);

    await bulk(cookie, { ids: [String(a), String(b)], status: "processing" });

    const logs = await AuditLog.find({ action: AuditAction.ORDER_STATUS_CHANGED }).lean();
    expect(logs.map((l) => l.targetId).sort()).toEqual([String(a), String(b)].sort());
    expect(await Notification.countDocuments({ type: NotificationType.ORDER_PREPARING })).toBe(2);
  });

  it("un id inexistente sale como rejected sin tumbar el lote", async () => {
    const cookie = await loginAsAdmin(app);
    const paid = await seed(OrderStatus.PAID);

    const res = await bulk(cookie, { ids: ["507f1f77bcf86cd799439011", String(paid)], status: "processing" });

    expect(res.status).toBe(200);
    expect(res.body.data.result.summary).toEqual({ updated: 1, unchanged: 0, rejected: 1 });
  });

  it("rechaza con 400 más de 50 ids, repetidos, vacío o un estado distinto de processing", async () => {
    const cookie = await loginAsAdmin(app);
    const paid = String(await seed(OrderStatus.PAID));
    const fake = (n: number): string => n.toString(16).padStart(24, "0");

    expect((await bulk(cookie, { ids: Array.from({ length: 51 }, (_, i) => fake(i + 1)), status: "processing" })).status).toBe(400);
    expect((await bulk(cookie, { ids: [paid, paid], status: "processing" })).status).toBe(400);
    expect((await bulk(cookie, { ids: [], status: "processing" })).status).toBe(400);
    const wrongStatus = await bulk(cookie, { ids: [paid], status: "cancelled" });
    expect(wrongStatus.status).toBe(400);
    expect(wrongStatus.body.message).toContain("«en proceso»");
    expect((await bulk(cookie, { ids: [paid], status: "paid" })).status).toBe(400);
    expect((await Order.findById(paid).lean())?.status).toBe(OrderStatus.PAID);
  });

  it("si una orden falla de forma inesperada, el lote sigue y reporta cuáles cambiaron", async () => {
    const cookie = await loginAsAdmin(app);
    const first = await seed(OrderStatus.PAID);
    const second = await seed(OrderStatus.PAID);
    const spy = vi
      .spyOn(Order, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("db hiccup"));

    const res = await bulk(cookie, { ids: [String(first), String(second)], status: "processing" });
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.result.summary).toEqual({ updated: 1, unchanged: 0, rejected: 1 });
    const failed = (res.body.data.result.results as Result[]).find((r) => r.outcome === "rejected");
    expect(failed?.message).toBe("No se pudo actualizar esta orden.");
    expect((await Order.findById(first).lean())?.status).toBe(OrderStatus.PAID);
    expect((await Order.findById(second).lean())?.status).toBe(OrderStatus.PROCESSING);
  });

  it("acepta exactamente 50 ids", async () => {
    const cookie = await loginAsAdmin(app);
    const ids = Array.from({ length: 50 }, (_, i) => (i + 1).toString(16).padStart(24, "0"));

    const res = await bulk(cookie, { ids, status: "processing" });

    expect(res.status).toBe(200);
    expect(res.body.data.result.summary.rejected).toBe(50);
  });

  it("exige admin: 401 anónimo y 403 cliente", async () => {
    const paid = String(await seed(OrderStatus.PAID));

    const anonymous = await request(app)
      .patch(`${BASE}/bulk-status`)
      .set("Origin", ORIGIN)
      .send({ ids: [paid], status: "processing" });
    expect(anonymous.status).toBe(401);
    expect((await bulk(await loginAsCustomer(app), { ids: [paid], status: "processing" })).status).toBe(403);
  });
});
