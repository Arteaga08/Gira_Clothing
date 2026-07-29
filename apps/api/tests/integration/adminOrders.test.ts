import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Currency, OrderStatus, AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { createOrder } from "../../src/services/orderService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { getPaymentProvider } from "../../src/adapters/payment/index.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";
const ADMIN_ORDERS_BASE = "/api/v1/admin/orders";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};
const validShipping = {
  recipient: "Ana Pérez",
  line1: "Calle Falsa 123",
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };
const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const seedVariant = async (adminCookie: string, suffix: string, onHand = 10): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

const seedOrder = async (adminCookie: string, suffix: string) => {
  const variantId = await seedVariant(adminCookie, suffix, 10);
  const result = await createOrder(
    {
      lines: [{ variantId, qty: 1 }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: uniqueKey(),
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return order!;
};

describe("Admin · Orders · autorización", () => {
  it("las cuatro rutas responden 401 anónimo", async () => {
    const order = await (async () => {
      const adminCookie = await loginAsAdmin(app);
      return seedOrder(adminCookie, "AUTH1");
    })();

    expect((await request(app).get(ADMIN_ORDERS_BASE)).status).toBe(401);
    expect((await request(app).get(`${ADMIN_ORDERS_BASE}/${order._id}`)).status).toBe(401);
    expect(
      (
        await request(app)
          .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
          .set("Origin", ORIGIN)
          .send({ status: "processing" })
      ).status,
    ).toBe(401);
    expect(
      (await request(app).post(`${ADMIN_ORDERS_BASE}/${order._id}/refund`).set("Origin", ORIGIN))
        .status,
    ).toBe(401);
  });

  it("las cuatro rutas responden 403 a un cliente", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "AUTH2");
    const customerCookie = await loginAsCustomer(app);

    expect((await request(app).get(ADMIN_ORDERS_BASE).set("Cookie", customerCookie)).status).toBe(
      403,
    );
    expect(
      (await request(app).get(`${ADMIN_ORDERS_BASE}/${order._id}`).set("Cookie", customerCookie))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
          .set("Origin", ORIGIN)
          .set("Cookie", customerCookie)
          .send({ status: "processing" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${ADMIN_ORDERS_BASE}/${order._id}/refund`)
          .set("Origin", ORIGIN)
          .set("Cookie", customerCookie)
      ).status,
    ).toBe(403);
  });
});

describe("Admin · Orders · listado", () => {
  it("pagina correctamente y filtra por ?status=", async () => {
    const adminCookie = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) {
      await seedOrder(adminCookie, `L${i}`);
    }

    const res = await request(app)
      .get(`${ADMIN_ORDERS_BASE}?limit=2&page=1`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);

    const filtered = await request(app)
      .get(`${ADMIN_ORDERS_BASE}?status=pending_payment`)
      .set("Cookie", adminCookie);
    expect(filtered.body.data.orders.length).toBeGreaterThanOrEqual(3);
  });

  it("?limit=1000 responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${ADMIN_ORDERS_BASE}?limit=1000`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });
});

describe("Admin · Orders · detalle", () => {
  it("responde 200 con líneas, totales, statusHistory y payment.intentId", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "D1");

    const res = await request(app).get(`${ADMIN_ORDERS_BASE}/${order._id}`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.order.lines).toBeDefined();
    expect(res.body.data.order.total).toBeDefined();
    expect(res.body.data.order.statusHistory.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.order.payment.intentId).toBeDefined();
  });

  it("id inexistente responde 404", async () => {
    const adminCookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${ADMIN_ORDERS_BASE}/507f1f77bcf86cd799439011`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });
});

describe("Admin · Orders · transición de estado", () => {
  it("paid -> processing responde 200", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "T1");
    await applyPaymentSucceeded(order._id);

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "processing" });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe("processing");
  });

  it("pending_payment -> processing responde 409 (transición inválida)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "T2");

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "processing" });
    expect(res.status).toBe(409);
  });

  it("intentar marcar paid a mano responde 403", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "T3");

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "paid" });
    expect(res.status).toBe(403);
  });

  it("status inválido responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "T4");

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "not-a-status" });
    expect(res.status).toBe(400);
  });

  it("registra ORDER_STATUS_CHANGED con before/after", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "T5");
    await applyPaymentSucceeded(order._id);

    await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "processing" });

    const entry = await AuditLog.findOne({
      action: AuditAction.ORDER_STATUS_CHANGED,
      targetId: order.publicId,
    }).lean();
    expect(entry?.before).toMatchObject({ status: "paid" });
    expect(entry?.after).toMatchObject({ status: "processing" });
  });
});

describe("Admin · Orders · reembolso", () => {
  it("sobre orden paid responde 200 y llama al adapter", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "R1");
    await applyPaymentSucceeded(order._id);

    const provider = getPaymentProvider();
    const spy = vi.spyOn(provider, "refundPayment").mockResolvedValue(undefined);

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/refund`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(order.payment.intentId);
    // The order does NOT flip to refunded here — only the webhook does that.
    expect(res.body.data.order.status).toBe(OrderStatus.PAID);
    spy.mockRestore();
  });

  it("sobre orden pending_payment responde 409", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "R2");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/refund`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(409);
  });
});
