import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { DisputeStatus, NotificationType, OrderStatus, ShippingLabelStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
} from "../helpers/fakeShippingProvider.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "TRACK", 200);
});
afterEach(restoreShippingProvider);

/** An order that is PAID with a READY label, optionally advanced to `status`. */
const paidOrderWithLabel = async (
  status: OrderStatus = OrderStatus.PAID,
): Promise<OrderDocument> => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  if (status !== OrderStatus.PAID) await Order.updateOne({ _id: order._id }, { $set: { status } });
  const fresh = await Order.findById(order._id);
  if (fresh?.label?.status !== ShippingLabelStatus.READY)
    throw new Error("label not ready in fixture");
  return fresh;
};

const notifications = (order: OrderDocument, type: NotificationType) =>
  Notification.find({ order: order._id, type }).lean();

import request from "supertest";

let adminCookie: string;
beforeEach(async () => {
  adminCookie = await loginAsAdmin(app);
});

const ship = (id: unknown, c = adminCookie) =>
  request(app)
    .post(`/api/v1/admin/orders/${String(id)}/ship`)
    .set("Origin", ORIGIN)
    .set("Cookie", c);

describe("POST /admin/orders/:id/ship", () => {
  it("processing + guía lista -> shipped, correo ORDER_SHIPPED y audit", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const res = await ship(order._id);
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe(OrderStatus.SHIPPED);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(fresh?.statusHistory.at(-1)?.actorType).toBe("user");
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    expect(
      await AuditLog.countDocuments({
        action: "order_marked_shipped",
        targetId: String(order._id),
      }),
    ).toBe(1);
  });

  it("409 si la orden está en paid (falta 'en proceso')", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PAID);
    const res = await ship(order._id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Primero pasa el pedido a «en proceso».");
  });

  it("409 si no hay guía lista", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne(
      { _id: order._id },
      { $set: { "label.status": ShippingLabelStatus.CANCEL_PENDING } },
    );
    expect((await ship(order._id)).status).toBe(409);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PROCESSING);
  });

  it("409 con disputa abierta o perdida", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: DisputeStatus.OPEN } });
    expect((await ship(order._id)).status).toBe(409);
  });

  it("dos clics a la vez: uno 200 y otro 409, un solo correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const [a, b] = await Promise.all([ship(order._id), ship(order._id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("404 si no existe; 401 sin sesión; 403 siendo cliente", async () => {
    expect((await ship("64b000000000000000000000")).status).toBe(404);
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/orders/${String(order._id)}/ship`)
          .set("Origin", ORIGIN)
      ).status,
    ).toBe(401);
    expect((await ship(order._id, await loginAsCustomer(app))).status).toBe(403);
  });
});
