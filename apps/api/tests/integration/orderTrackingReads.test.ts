import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import { OrderStatus, ShipmentTrackingStatus as S, ShippingLabelStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { applyTrackingEvents } from "../../src/services/shipmentTrackingService.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
} from "../helpers/fakeShippingProvider.js";
import { createCustomer, loginAsAdmin, loginCustomer } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "READS", 200);
});
afterEach(restoreShippingProvider);

/** A PAID order with a READY label, optionally advanced to `status`. */
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

const track = (publicId: string) => request(app).get(`/api/v1/orders/${publicId}/tracking`);

describe("GET /orders/:publicId/tracking", () => {
  it("404 igual para inexistente y para pedido aún no enviado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const notShipped = await track(order.publicId);
    const unknown = await track("x".repeat(43));
    expect(notShipped.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(notShipped.body.message).toBe(unknown.body.message);
  });

  it("enviado: devuelve folio, paquetería, guía, trackUrl y eventos, sin publicId", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents("stub", [
      {
        trackingNumber: order.label!.trackingNumber!,
        status: S.PICKED_UP,
        rawStatus: "picked_up",
        occurredAt: new Date(),
        providerEventId: "evt-reads-1",
      },
    ]);
    const res = await track(order.publicId);
    expect(res.status).toBe(200);
    const t = res.body.data.tracking;
    expect(t).toMatchObject({
      orderNumber: order.orderNumber,
      trackingNumber: order.label!.trackingNumber,
      carrierName: "Estafeta",
    });
    expect(t.events).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(order.publicId);
  });
});

describe("GET /orders/mine", () => {
  it("incluye shipment solo cuando la orden ya está enviada", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: order._id }, { $set: { user: customer.id } });

    const before = await request(app).get("/api/v1/orders/mine").set("Cookie", cookie);
    expect(before.body.data.orders[0].shipment).toBeUndefined();

    await Order.updateOne(
      { _id: order._id },
      { $set: { status: OrderStatus.SHIPPED, shippedAt: new Date() } },
    );
    const after = await request(app).get("/api/v1/orders/mine").set("Cookie", cookie);
    expect(after.body.data.orders[0].shipment).toMatchObject({ carrierName: "Estafeta" });
    expect(after.body.data.orders[0].shipment.trackingNumber).toBeTruthy();
  });
});
