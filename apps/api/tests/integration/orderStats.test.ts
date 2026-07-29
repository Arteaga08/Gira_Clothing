import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, OrderStatus, PaymentStatus, PriceRounding } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();

const STATS_URL = "/api/v1/admin/orders/stats";

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

interface SeedOrderOptions {
  status: OrderStatus;
  total: number;
  currency?: Currency;
  createdAt?: Date;
  paidAt?: Date;
  updatedAt?: Date;
  sku?: string;
  qty?: number;
}

/**
 * Direct Order.create fixture — bypasses createOrder/reservationService on
 * purpose. Stats only read the Order collection, so a hand-built snapshot
 * with controllable createdAt/updatedAt/paidAt is far simpler than driving
 * the full checkout + payment flow for every timestamp permutation.
 */
const seedStatsOrder = async (opts: SeedOrderOptions): Promise<mongoose.Types.ObjectId> => {
  const variant = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  const sku = opts.sku ?? `SKU-${variant.toHexString().slice(-6)}`;
  const qty = opts.qty ?? 1;
  const currency = opts.currency ?? Currency.MXN;

  const doc = await Order.create({
    publicId: new mongoose.Types.ObjectId().toHexString() + "x".repeat(20),
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
        unitPriceMxn: opts.total,
        unitPrice: opts.total,
        lineTotal: opts.total,
      },
    ],
    currency,
    exchangeRate: 1,
    rounding: PriceRounding.NONE,
    subtotal: opts.total,
    shippingCost: 0,
    total: opts.total,
    status: opts.status,
    statusHistory: [{ status: opts.status, at: opts.createdAt ?? new Date() }],
    payment: { provider: "stripe", status: PaymentStatus.SUCCEEDED },
    idempotencyKey: new mongoose.Types.ObjectId().toHexString(),
    ...(opts.paidAt ? { paidAt: opts.paidAt } : {}),
  });

  // createdAt/updatedAt are timestamps Mongoose manages; overriding them
  // requires a second write with timestamps disabled, same trick as M4's
  // notification tests. `createdAt` is marked `immutable: true` by Mongoose's
  // own timestamps plugin, so a Mongoose-level update silently strips it from
  // $set regardless of { timestamps: false } — that option only controls
  // auto-assignment, not the path's immutability. Going through the native
  // driver (Order.collection, not the Mongoose model) skips that casting
  // entirely, which is exactly what a test fixture needs to fake history.
  if (opts.createdAt || opts.updatedAt) {
    await Order.collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          createdAt: opts.createdAt ?? opts.updatedAt,
          updatedAt: opts.updatedAt ?? opts.createdAt,
        },
      },
    );
  }

  return doc._id;
};

describe("GET /admin/orders/stats · autorización", () => {
  it("anónimo responde 401", async () => {
    expect((await request(app).get(STATS_URL)).status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const customerCookie = await loginAsCustomer(app);
    expect((await request(app).get(STATS_URL).set("Cookie", customerCookie)).status).toBe(403);
  });
});

describe("GET /admin/orders/stats · período e ingresos", () => {
  it("cuenta solo las órdenes pagadas como ingreso, ninguna pendiente", async () => {
    const adminCookie = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) {
      await seedStatsOrder({ status: OrderStatus.PAID, total: 10000, paidAt: new Date() });
    }
    await seedStatsOrder({ status: OrderStatus.PENDING_PAYMENT, total: 10000 });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.period.paidOrders).toBe(3);
    expect(res.body.data.period.revenue).toHaveLength(1);
    expect(res.body.data.period.revenue[0]).toMatchObject({ currency: "MXN", revenue: 30000, orders: 3 });
  });

  it("agrupa ingresos por moneda sin sumarlas entre sí", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({ status: OrderStatus.PAID, total: 10000, currency: Currency.MXN });
    await seedStatsOrder({ status: OrderStatus.PAID, total: 5000, currency: Currency.USD });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    const revenue = res.body.data.period.revenue as { currency: string; revenue: number }[];
    expect(revenue).toHaveLength(2);
    const mxn = revenue.find((r) => r.currency === "MXN");
    const usd = revenue.find((r) => r.currency === "USD");
    expect(mxn?.revenue).toBe(10000);
    expect(usd?.revenue).toBe(5000);
  });

  it("calcula el ticket promedio en enteros", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({ status: OrderStatus.PAID, total: 10000 });
    await seedStatsOrder({ status: OrderStatus.PAID, total: 20000 });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.period.revenue[0].averageTicket).toBe(15000);
  });

  it("una orden fuera de la ventana no cuenta en el período", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({ status: OrderStatus.PAID, total: 10000, createdAt: daysAgo(60) });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.period.totalOrders).toBe(0);
  });

  it("byStatus trae el conteo de cada estado presente", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({ status: OrderStatus.PAID, total: 10000 });
    await seedStatsOrder({ status: OrderStatus.PENDING_PAYMENT, total: 10000 });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.byStatus.paid).toBe(1);
    expect(res.body.data.byStatus.pending_payment).toBe(1);
  });

  it("sin órdenes, responde ceros y arreglos vacíos, nunca null", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.period.totalOrders).toBe(0);
    expect(res.body.data.period.revenue).toEqual([]);
    expect(res.body.data.period.topProducts).toEqual([]);
    expect(res.body.data.period.unitsSold).toBe(0);
  });

  it("topProducts refleja unidades por SKU y se topa en 5", async () => {
    const adminCookie = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) {
      await seedStatsOrder({ status: OrderStatus.PAID, total: 10000, sku: "SKU-TOP", qty: 2 });
    }
    for (let i = 0; i < 7; i += 1) {
      await seedStatsOrder({ status: OrderStatus.PAID, total: 5000, sku: `SKU-OTHER-${i}`, qty: 1 });
    }

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.period.topProducts.length).toBeLessThanOrEqual(5);
    expect(res.body.data.period.topProducts[0]).toMatchObject({ sku: "SKU-TOP", units: 6 });
  });

  it("unitsSold cuenta TODAS las unidades del período, no solo el top-5", async () => {
    const adminCookie = await loginAsAdmin(app);
    for (let i = 0; i < 7; i += 1) {
      await seedStatsOrder({ status: OrderStatus.PAID, total: 5000, sku: `SKU-U-${i}`, qty: 2 });
    }

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.period.unitsSold).toBe(14);
  });

  it("?days=abc responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const res = await request(app).get(`${STATS_URL}?days=abc`).set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/orders/stats · alertas (independientes del rango)", () => {
  it("una orden pagada hace 3 días aparece en awaitingPreparation aunque ?days=1", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({
      status: OrderStatus.PAID,
      total: 10000,
      paidAt: daysAgo(3),
      createdAt: daysAgo(3),
    });

    const res = await request(app).get(`${STATS_URL}?days=1`).set("Cookie", adminCookie);

    expect(res.body.data.alerts.awaitingPreparation).toBe(1);
  });

  it("processing hace 5 días cuenta como stuckInProcessing", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({
      status: OrderStatus.PROCESSING,
      total: 10000,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.alerts.stuckInProcessing).toBe(1);
  });

  it("shipped hace 20 días cuenta como inTransitTooLong", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({
      status: OrderStatus.SHIPPED,
      total: 10000,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(20),
    });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.alerts.inTransitTooLong).toBe(1);
  });

  it("una orden disputed cuenta en alerts.disputed", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedStatsOrder({ status: OrderStatus.DISPUTED, total: 10000 });

    const res = await request(app).get(`${STATS_URL}?days=30`).set("Cookie", adminCookie);

    expect(res.body.data.alerts.disputed).toBe(1);
  });
});
