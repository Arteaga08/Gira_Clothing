import { describe, it, expect } from "vitest";
import request from "supertest";
import { ORDER_NUMBER_PATTERN, OrderPriority, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { applyOrderTransition } from "../../src/services/orderTransitionService.js";
import { createCustomer, loginAsAdmin, loginCustomer } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();

const FORBIDDEN_FOR_CUSTOMER = [
  "termsAcceptedAt",
  "cancelReason",
  "priority",
  "statusHistory",
  "payment",
  "user",
  "idempotencyKey",
  "updatedAt",
];

describe("DTOs de orden", () => {
  it("el DTO público lleva folio y desglose y NADA administrativo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "DTO1"));

    const res = await request(app).get(`/api/v1/orders/${order.publicId}`);

    expect(res.status).toBe(200);
    const body = res.body.data.order as Record<string, unknown>;
    expect(body.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(body).toMatchObject({ discount: 0, taxRateBps: 1600 });
    expect(typeof body.tax).toBe("number");
    for (const key of FORBIDDEN_FOR_CUSTOMER) expect(body).not.toHaveProperty(key);
  });

  it("'mis órdenes' lleva id y folio, sin campos administrativos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const customer = await createCustomer();
    const customerCookie = await loginCustomer(app, customer);
    const variantId = await seedCatalogVariant(app, adminCookie, "DTO2");
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { user: customer.id } });

    const res = await request(app).get("/api/v1/orders/mine").set("Cookie", customerCookie);

    expect(res.status).toBe(200);
    const mine = res.body.data.orders as Record<string, unknown>[];
    expect(mine).toHaveLength(1);
    for (const o of mine) {
      expect(o).toHaveProperty("id");
      expect(o).toHaveProperty("orderNumber");
      for (const key of FORBIDDEN_FOR_CUSTOMER) expect(o).not.toHaveProperty(key);
    }
  });

  it("el DTO admin trae prioridad, términos, pago y ids como texto, sin secretos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await createPendingOrder(await seedCatalogVariant(app, adminCookie, "DTO3"));
    await applyOrderTransition({
      orderId: order._id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.CANCELLED,
      actor: { type: "user", id: order._id },
      reason: "admin_cancelled",
      set: { cancelReason: "Prueba de DTO" },
    });

    const res = await request(app)
      .get(`/api/v1/admin/orders/${String(order._id)}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    const o = res.body.data.order as {
      id: unknown;
      orderNumber: string;
      priority: string;
      termsAcceptedAt: unknown;
      cancelReason: string;
      payment: Record<string, unknown>;
      statusHistory: { actorId?: unknown }[];
    };
    expect(typeof o.id).toBe("string");
    expect(o.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(o.priority).toBe(OrderPriority.NORMAL);
    expect(typeof o.termsAcceptedAt).toBe("string");
    expect(o.cancelReason).toBe("Prueba de DTO");
    expect(o.payment).toMatchObject({ provider: "stripe" });
    expect(o.payment).not.toHaveProperty("clientSecret");
    for (const h of o.statusHistory) {
      if (h.actorId !== undefined) expect(typeof h.actorId).toBe("string");
    }
  });
});
