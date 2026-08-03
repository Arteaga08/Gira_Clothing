import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, OrderStatus, PaymentStatus, PriceRounding } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { localDayKey, localMidnightUtc } from "../../src/utils/parseDayRange.js";
import { bucketKeyFor } from "../../src/utils/statsBucketing.js";

const app = buildApp();
const URL = "/api/v1/admin/stats/top-products";

interface SeedOptions {
  createdAt: Date;
  sku?: string;
  qty?: number;
}

const seedProductOrder = async (opts: SeedOptions): Promise<void> => {
  const variant = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  const sku = opts.sku ?? `SKU-${variant.toHexString().slice(-6)}`;
  const qty = opts.qty ?? 1;

  const doc = await Order.create({
    publicId: new mongoose.Types.ObjectId().toHexString() + "z".repeat(20),
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
    statusHistory: [{ status: OrderStatus.PAID, at: opts.createdAt }],
    payment: { provider: "stripe", status: PaymentStatus.SUCCEEDED },
    idempotencyKey: new mongoose.Types.ObjectId().toHexString(),
    paidAt: opts.createdAt,
  });

  await Order.collection.updateOne({ _id: doc._id }, { $set: { createdAt: opts.createdAt } });
};

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("GET /admin/stats/top-products · autorización", () => {
  it("anónimo responde 401", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(`${URL}?period=today`).set("Cookie", cookie)).status).toBe(403);
  });
});

describe("GET /admin/stats/top-products · validación", () => {
  it("sin period responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("period=abc responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?period=abc`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("period=custom sin fecha responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?period=custom`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("period=today con fecha responde 400 (fecha solo aplica a custom)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?period=today&fecha=2026-07-01`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("period=custom con fecha mal formada responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?period=custom&fecha=01-07-2026`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/stats/top-products · periodos", () => {
  it("period=today: cuenta un pedido de hace 2 horas, ignora uno de hace 3 días", async () => {
    const cookie = await loginAsAdmin(app);
    await seedProductOrder({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), sku: "SKU-HOY", qty: 3 });
    await seedProductOrder({ createdAt: daysAgo(3), sku: "SKU-VIEJO", qty: 5 });

    const res = await request(app).get(`${URL}?period=today`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe("today");
    expect(res.body.data.products.some((p: { sku: string }) => p.sku === "SKU-HOY")).toBe(true);
    expect(res.body.data.products.some((p: { sku: string }) => p.sku === "SKU-VIEJO")).toBe(false);
  });

  it("period=week: cuenta un pedido de esta semana (lunes + 1h), ignora uno de hace 20 días", async () => {
    const cookie = await loginAsAdmin(app);
    // "Hace 2 días" sería flaky si el test corre un lunes o martes (caería
    // en la semana pasada). En vez de asumir en qué día corre la suite, se
    // calcula el propio inicio de la semana con los mismos helpers que usa
    // la implementación — esto no es circular: no se está probando
    // bucketKeyFor/localMidnightUtc aquí, solo reusándolos para construir un
    // fixture que sea correcto sin importar el día de hoy.
    const mondayKey = bucketKeyFor(localDayKey(new Date()), "week");
    const mondayPlusOneHour = new Date(localMidnightUtc(mondayKey).getTime() + 60 * 60 * 1000);
    await seedProductOrder({ createdAt: mondayPlusOneHour, sku: "SKU-SEMANA" });
    await seedProductOrder({ createdAt: daysAgo(20), sku: "SKU-FUERA" });

    const res = await request(app).get(`${URL}?period=week`).set("Cookie", cookie);

    expect(res.body.data.period).toBe("week");
    const skus = res.body.data.products.map((p: { sku: string }) => p.sku);
    expect(skus).toContain("SKU-SEMANA");
    expect(skus).not.toContain("SKU-FUERA");
  });

  it("period=custom: solo cuenta pedidos de esa fecha exacta", async () => {
    const cookie = await loginAsAdmin(app);
    await seedProductOrder({ createdAt: new Date("2026-06-15T18:00:00Z"), sku: "SKU-DIA-EXACTO" });
    await seedProductOrder({ createdAt: new Date("2026-06-16T18:00:00Z"), sku: "SKU-OTRO-DIA" });

    const res = await request(app)
      .get(`${URL}?period=custom&fecha=2026-06-15`)
      .set("Cookie", cookie);

    expect(res.body.data.period).toBe("custom");
    const skus = res.body.data.products.map((p: { sku: string }) => p.sku);
    expect(skus).toContain("SKU-DIA-EXACTO");
    expect(skus).not.toContain("SKU-OTRO-DIA");
  });

  it("sin pedidos en el periodo, responde products: [], nunca null", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?period=custom&fecha=2020-01-01`).set("Cookie", cookie);
    expect(res.body.data.products).toEqual([]);
  });

  it("agrupa unidades por SKU sumando cantidades", async () => {
    const cookie = await loginAsAdmin(app);
    const now = new Date(Date.now() - 60 * 1000);
    await seedProductOrder({ createdAt: now, sku: "SKU-SUMA", qty: 2 });
    await seedProductOrder({ createdAt: now, sku: "SKU-SUMA", qty: 3 });

    const res = await request(app).get(`${URL}?period=today`).set("Cookie", cookie);

    const match = res.body.data.products.find((p: { sku: string }) => p.sku === "SKU-SUMA");
    expect(match.units).toBe(5);
  });
});
