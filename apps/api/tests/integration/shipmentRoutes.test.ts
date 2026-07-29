import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { createOrder } from "../../src/services/orderService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { changeOrderStatus } from "../../src/services/adminOrderService.js";
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

const seedOrder = async (adminCookie: string, suffix: string): Promise<OrderDocument> => {
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

const seedProcessingOrder = async (adminCookie: string, suffix: string): Promise<OrderDocument> => {
  const order = await seedOrder(adminCookie, suffix);
  await applyPaymentSucceeded(order._id);
  await changeOrderStatus(String(order._id), OrderStatus.PROCESSING, {});
  return (await Order.findById(order._id))!;
};

describe("Admin · Shipment · autorización", () => {
  it("las tres rutas responden 401 anónimo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R1");
    const base = `${ADMIN_ORDERS_BASE}/${order._id}/shipment`;

    expect((await request(app).get(base)).status).toBe(401);
    expect(
      (await request(app).post(base).set("Origin", ORIGIN).send({ carrier: "Estafeta", trackingNumber: "1" }))
        .status,
    ).toBe(401);
    expect(
      (await request(app).patch(base).set("Origin", ORIGIN).send({ status: "delivered" })).status,
    ).toBe(401);
  });

  it("las tres rutas responden 403 a un cliente", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R2");
    const customerCookie = await loginAsCustomer(app);
    const base = `${ADMIN_ORDERS_BASE}/${order._id}/shipment`;

    expect((await request(app).get(base).set("Cookie", customerCookie)).status).toBe(403);
    expect(
      (
        await request(app)
          .post(base)
          .set("Origin", ORIGIN)
          .set("Cookie", customerCookie)
          .send({ carrier: "Estafeta", trackingNumber: "1" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(base)
          .set("Origin", ORIGIN)
          .set("Cookie", customerCookie)
          .send({ status: "delivered" })
      ).status,
    ).toBe(403);
  });
});

describe("Admin · Shipment · creación", () => {
  it("crea el envío y responde 201", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R3");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    expect(res.status).toBe(201);
    expect(res.body.data.shipment.status).toBe("in_transit");

    const detail = await request(app).get(`${ADMIN_ORDERS_BASE}/${order._id}`).set("Cookie", adminCookie);
    expect(detail.body.data.order.status).toBe("shipped");
  });

  it("sin carrier responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R4");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ trackingNumber: "1234567890" });

    expect(res.status).toBe(400);
  });

  it("trackingNumber vacío responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R5");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "" });

    expect(res.status).toBe(400);
  });

  it("trackingUrl que no es URL responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R6");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1", trackingUrl: "no-es-url" });

    expect(res.status).toBe(400);
  });

  it("descarta campos desconocidos (stripUnknown)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R7");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890", forged: "hack" });

    expect(res.status).toBe(201);
  });

  it("con un Origin fuera de la whitelist responde 403 (verifyOrigin)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R8");

    const res = await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", "http://evil.example.com")
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    expect(res.status).toBe(403);
  });
});

describe("Admin · Shipment · evento y lectura", () => {
  it("PATCH agrega un evento y responde 200", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R9");
    await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.data.shipment.status).toBe("delivered");
  });

  it("un status inválido responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R10");
    await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    const res = await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "wat" });

    expect(res.status).toBe(400);
  });

  it("GET admin devuelve el envío con sus eventos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R11");
    await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    const res = await request(app)
      .get(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.shipment.events).toHaveLength(1);
  });

  it("GET admin sobre una orden sin envío responde 404", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R12");

    const res = await request(app)
      .get(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(404);
  });
});

describe("GET /orders/:publicId/tracking — público", () => {
  it("responde 200 sin sesión, sin datos internos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "R13");
    await request(app)
      .post(`${ADMIN_ORDERS_BASE}/${order._id}/shipment`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ carrier: "Estafeta", trackingNumber: "1234567890" });

    const res = await request(app).get(`/api/v1/orders/${order.publicId}/tracking`);

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("shipping");
    expect(serialized).not.toContain("total");
    expect(serialized).not.toContain("_id");
    expect(serialized).not.toContain(String(order._id));
  });

  it("responde 404 cuando el publicId no existe", async () => {
    const res = await request(app).get(
      `/api/v1/orders/${"A".repeat(43)}/tracking`,
    );
    expect(res.status).toBe(404);
  });

  it("un publicId con formato inválido responde 400 sin tocar la DB", async () => {
    const res = await request(app).get("/api/v1/orders/***/tracking");
    expect(res.status).toBe(400);
  });
});
