import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, OrderStatus, PaymentStatus, PriceRounding } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const OVERVIEW_URL = "/api/v1/admin/stats/overview";
const ORDER_STATS_URL = "/api/v1/admin/orders/stats";
const VARIANT_STATS_URL = "/api/v1/admin/variants/stats";
const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const seedOrder = async (sku: string, qty: number): Promise<void> => {
  const variant = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  await Order.create({
    publicId: new mongoose.Types.ObjectId().toHexString() + "y".repeat(20),
    customer: { email: "cliente@example.com", name: "Ana Pérez" },
    shipping: {
      recipient: "Ana Pérez",
      line1: "Calle Falsa 123",
      city: "CDMX",
      state: "CDMX",
      postalCode: "01000",
      country: "MX",
    },
    lines: [
      {
        variant,
        product,
        sku,
        productName: "Tote",
        printName: "Amapolas",
        qty,
        unitPriceMxn: 10000,
        unitPrice: 10000,
        lineTotal: 10000 * qty,
      },
    ],
    currency: Currency.MXN,
    exchangeRate: 1,
    rounding: PriceRounding.NONE,
    subtotal: 10000 * qty,
    shippingCost: 0,
    total: 10000 * qty,
    status: OrderStatus.PAID,
    statusHistory: [{ status: OrderStatus.PAID, at: new Date() }],
    payment: { provider: "stripe", status: PaymentStatus.SUCCEEDED },
    idempotencyKey: new mongoose.Types.ObjectId().toHexString(),
    paidAt: new Date(),
  });
};

const seedVariant = async (adminCookie: string, suffix: string, onHand: number): Promise<void> => {
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
};

describe("GET /admin/stats/overview · autorización", () => {
  it("anónimo responde 401", async () => {
    expect((await request(app).get(OVERVIEW_URL)).status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const customerCookie = await loginAsCustomer(app);
    expect((await request(app).get(OVERVIEW_URL).set("Cookie", customerCookie)).status).toBe(403);
  });
});

describe("GET /admin/stats/overview · composición pura", () => {
  it("coincide exactamente con los stats de cada módulo por separado", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedOrder("SKU-OV-1", 3);
    await seedVariant(adminCookie, "OV1", 10);

    const [overview, orders, variants] = await Promise.all([
      request(app).get(`${OVERVIEW_URL}?days=30`).set("Cookie", adminCookie),
      request(app).get(`${ORDER_STATS_URL}?days=30`).set("Cookie", adminCookie),
      request(app).get(VARIANT_STATS_URL).set("Cookie", adminCookie),
    ]);

    expect(overview.status).toBe(200);
    expect(overview.body.data.orders.period.totalOrders).toBe(
      orders.body.data.period.totalOrders,
    );
    expect(overview.body.data.orders.byStatus).toEqual(orders.body.data.byStatus);
    expect(overview.body.data.inventory.activeVariants).toBe(
      variants.body.data.activeVariants,
    );
    expect(overview.body.data.inventory.unitsOnHand).toBe(variants.body.data.unitsOnHand);
  });

  it("usa la misma ventana para el bloque de órdenes que la que se pidió", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app).get(`${OVERVIEW_URL}?days=7`).set("Cookie", adminCookie);

    expect(res.body.data.orders.range.days).toBe(7);
  });

  it("recorta topProducts y lowStockItems a lo más 5", async () => {
    const adminCookie = await loginAsAdmin(app);
    for (let i = 0; i < 7; i += 1) {
      await seedOrder(`SKU-CUT-${i}`, 1);
    }
    for (let i = 0; i < 7; i += 1) {
      await seedVariant(adminCookie, `CUT${i}`, 0);
    }

    const res = await request(app).get(`${OVERVIEW_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.orders.period.topProducts.length).toBeLessThanOrEqual(5);
    expect(res.body.data.inventory.lowStockItems.length).toBeLessThanOrEqual(5);
  });

  it("con base vacía, responde la estructura completa con ceros, sin null", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app).get(`${OVERVIEW_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.orders.period.totalOrders).toBe(0);
    expect(res.body.data.orders.period.revenue).toEqual([]);
    expect(res.body.data.inventory.activeVariants).toBe(0);
    expect(res.body.data.inventory.lowStockItems).toEqual([]);
  });
});
