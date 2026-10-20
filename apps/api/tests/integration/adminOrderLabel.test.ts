import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let cookie: string;
let variantId: string;
beforeEach(async () => {
  cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "RETRY", 200);
});

const retry = (id: unknown, c = cookie) =>
  request(app).post(`/api/v1/admin/orders/${String(id)}/label/retry`).set("Origin", ORIGIN).set("Cookie", c);

describe("POST /admin/orders/:id/label/retry", () => {
  it("devuelve a la cola una guía en needs_review y la compra", async () => {
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "needs_review", attempts: 5, cancelAttempts: 0, lastError: "x" } } });
    const res = await retry(order._id);
    expect(res.status).toBe(200);
    await settleLabelWork();
    const label = (await Order.findById(order._id).lean())?.label;
    expect(label?.status).toBe("ready");
    expect(label?.attempts).toBe(1);
  });

  it("409 si ya tiene guía o está en otro estado; 404 si no existe; 401/403 sin permisos", async () => {
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "ready", attempts: 1, cancelAttempts: 0, trackingNumber: "T1" } } });
    expect((await retry(order._id)).status).toBe(409);
    expect((await retry("64b000000000000000000000")).status).toBe(404);
    expect((await request(app).post(`/api/v1/admin/orders/${String(order._id)}/label/retry`).set("Origin", ORIGIN)).status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    expect((await retry(order._id, customerCookie)).status).toBe(403);
  });
});
